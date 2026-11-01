import io
import csv
import logging
from flask import Blueprint, request, jsonify, Response
from app.database import get_db
from app.models import Room, Equipment, OccupancyReading

logger = logging.getLogger(__name__)
rooms_bp = Blueprint("rooms", __name__)

@rooms_bp.route("/rooms/export", methods=["GET"])
def export_rooms_csv():
    """Exports classroom inventory and occupancy statistics as a downloadable CSV."""
    db_gen = get_db()
    db = next(db_gen)
    try:
        rooms = db.query(Room).all()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "Room ID", "Building", "Room Number", "Room Type", 
            "Capacity", "Current Occupancy", "Utilization Pct", "Operating Hours", "Utilization Status"
        ])
        for r in rooms:
            latest_occ = (
                db.query(OccupancyReading)
                .filter(OccupancyReading.room_id == r.id)
                .order_by(OccupancyReading.recorded_at.desc())
                .first()
            )
            cnt = latest_occ.people_count if latest_occ else 0
            pct = round((cnt / r.capacity * 100.0), 1) if r.capacity > 0 else 0.0
            status = "Overcapacity" if cnt > r.capacity else ("High" if pct >= 75 else ("Normal" if pct >= 30 else "Low"))
            writer.writerow([
                r.id, r.building, r.room_number, r.room_type,
                r.capacity, cnt, f"{pct}%", r.operating_hours, status
            ])

        output.seek(0)
        return Response(
            output.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=campustwin_rooms_report.csv"}
        )
    finally:
        try:
            db_gen.close()
        except Exception:
            pass

@rooms_bp.route("/rooms", methods=["GET"])
def get_rooms():
    """Returns list of all classrooms with their latest occupancy status."""
    db = next(get_db())
    rooms = db.query(Room).all()

    result = []
    for r in rooms:
        latest_occ = (
            db.query(OccupancyReading)
            .filter(OccupancyReading.room_id == r.id)
            .order_by(OccupancyReading.recorded_at.desc())
            .first()
        )
        result.append(r.to_dict(current_occupancy=latest_occ))

    return jsonify({"status": "success", "total": len(result), "rooms": result}), 200

@rooms_bp.route("/rooms/<int:room_id>", methods=["GET"])
def get_room(room_id):
    """Returns details and equipment for a specific room."""
    db = next(get_db())
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        return jsonify({"status": "error", "message": f"Room {room_id} not found."}), 404

    latest_occ = (
        db.query(OccupancyReading)
        .filter(OccupancyReading.room_id == room.id)
        .order_by(OccupancyReading.recorded_at.desc())
        .first()
    )

    data = room.to_dict(current_occupancy=latest_occ)
    data["equipment"] = [eq.to_dict() for eq in room.equipment_items]
    return jsonify({"status": "success", "room": data}), 200

@rooms_bp.route("/rooms", methods=["POST"])
def create_room():
    """Registers a new classroom with optional equipment items."""
    data = request.get_json() or {}
    building = (data.get("building") or "").strip()
    room_number = (data.get("room_number") or "").strip()
    capacity = int(data.get("capacity") or 30)

    if not building or not room_number:
        return jsonify({"status": "error", "message": "Building and room number are required."}), 400

    if capacity <= 0 or capacity > 1000:
        return jsonify({"status": "error", "message": "Room capacity must be between 1 and 1000."}), 400

    db = next(get_db())
    # Check duplicate
    existing = db.query(Room).filter(Room.building == building, Room.room_number == room_number).first()
    if existing:
        return jsonify({"status": "error", "message": f"Room '{building} - {room_number}' already exists."}), 409

    room = Room(
        building=building,
        room_number=room_number,
        capacity=capacity,
        room_type=data.get("room_type", "Lecture Hall"),
        camera_source=data.get("camera_source", "webcam_0"),
        operating_hours=data.get("operating_hours", "08:00 - 18:00")
    )
    db.add(room)
    db.commit()
    db.refresh(room)

    # Add default equipment if none provided
    equipment_list = data.get("equipment")
    if not equipment_list:
        equipment_list = [
            {"name": "LED Ceiling Panels", "quantity": max(2, capacity // 10), "watts": 40.0},
            {"name": "Ceiling Fans", "quantity": max(2, capacity // 15), "watts": 75.0},
            {"name": "Split AC 2-Ton", "quantity": max(1, capacity // 30), "watts": 2000.0},
            {"name": "Smart Projector", "quantity": 1, "watts": 300.0}
        ]

    for eq_data in equipment_list:
        eq = Equipment(
            room_id=room.id,
            equipment_name=eq_data.get("name") or eq_data.get("equipment_name", "Equipment"),
            quantity=int(eq_data.get("quantity", 1)),
            power_rating_watts=float(eq_data.get("watts") or eq_data.get("power_rating_watts", 100.0)),
            is_active=bool(eq_data.get("is_active", True))
        )
        db.add(eq)

    db.commit()

    # Initial zero reading
    init_occ = OccupancyReading(
        room_id=room.id,
        people_count=0,
        occupancy_percentage=0.0,
        source_type="demo_data"
    )
    db.add(init_occ)
    db.commit()

    return jsonify({"status": "success", "message": "Room created successfully.", "room": room.to_dict()}), 201

@rooms_bp.route("/rooms/<int:room_id>", methods=["PUT"])
def update_room(room_id):
    """Updates an existing room's configuration."""
    db = next(get_db())
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        return jsonify({"status": "error", "message": f"Room {room_id} not found."}), 404

    data = request.get_json() or {}
    if "building" in data:
        room.building = data["building"].strip()
    if "room_number" in data:
        room.room_number = data["room_number"].strip()
    if "capacity" in data:
        room.capacity = max(1, int(data["capacity"]))
    if "room_type" in data:
        room.room_type = data["room_type"]
    if "camera_source" in data:
        room.camera_source = data["camera_source"]
    if "operating_hours" in data:
        room.operating_hours = data["operating_hours"]

    db.commit()
    db.refresh(room)
    return jsonify({"status": "success", "message": "Room updated successfully.", "room": room.to_dict()}), 200

@rooms_bp.route("/rooms/<int:room_id>", methods=["DELETE"])
def delete_room(room_id):
    """Deletes a room and associated readings."""
    db = next(get_db())
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        return jsonify({"status": "error", "message": f"Room {room_id} not found."}), 404

    db.delete(room)
    db.commit()
    return jsonify({"status": "success", "message": f"Room {room_id} deleted successfully."}), 200
