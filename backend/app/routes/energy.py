import logging
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from app.database import get_db
from app.models import Room, EnergyReading, OccupancyReading
from app.services.energy_service import EnergyIntelligenceService

logger = logging.getLogger(__name__)
energy_bp = Blueprint("energy", __name__)

@energy_bp.route("/energy/summary", methods=["GET"])
def get_energy_summary():
    """
    Returns campus-wide real-time estimated energy demand,
    room comparisons, equipment totals, and optimization tips.
    Clearly distinguishes estimated kWh from actual meter measurements.
    """
    db = next(get_db())
    rooms = db.query(Room).all()

    total_effective_kw = 0.0
    total_base_equipment_watts = 0.0
    room_comparisons = []
    all_recommendations = []

    for r in rooms:
        latest_occ = (
            db.query(OccupancyReading)
            .filter(OccupancyReading.room_id == r.id)
            .order_by(OccupancyReading.recorded_at.desc())
            .first()
        )
        people_count = latest_occ.people_count if latest_occ else 0

        power_calc = EnergyIntelligenceService.calculate_room_power_watts(r, people_count)
        total_effective_kw += power_calc["effective_power_kw"]
        total_base_equipment_watts += power_calc["base_equipment_watts"]

        # Today's estimated consumption
        start_of_day = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        daily_readings = (
            db.query(EnergyReading)
            .filter(EnergyReading.room_id == r.id, EnergyReading.recorded_at >= start_of_day)
            .all()
        )
        today_est_kwh = sum(dr.estimated_kwh for dr in daily_readings)
        today_act_kwh = sum(dr.actual_kwh for dr in daily_readings if dr.actual_kwh is not None)

        room_comparisons.append({
            "room_id": r.id,
            "room_name": f"{r.building} - {r.room_number}",
            "people_count": people_count,
            "capacity": r.capacity,
            "active_power_kw": power_calc["effective_power_kw"],
            "today_estimated_kwh": round(today_est_kwh, 2),
            "today_actual_kwh": round(today_act_kwh, 2) if today_act_kwh > 0 else None,
            "equipment_count": len(r.equipment_items),
            "equipment_breakdown": power_calc["equipment_breakdown"]
        })

        # Generate optimization advice
        recs = EnergyIntelligenceService.generate_energy_recommendations(r, people_count, power_calc["effective_power_kw"])
        all_recommendations.extend(recs)

    # Sort rooms by active power demand descending
    room_comparisons.sort(key=lambda x: x["active_power_kw"], reverse=True)

    # Campus daily extrapolation (12 operating hours average)
    projected_daily_kwh = round(total_effective_kw * 10.5, 2)

    return jsonify({
        "status": "success",
        "current_total_demand_kw": round(total_effective_kw, 2),
        "total_connected_equipment_kw": round(total_base_equipment_watts / 1000.0, 2),
        "projected_daily_kwh": projected_daily_kwh,
        "rooms_monitored": len(rooms),
        "room_comparisons": room_comparisons,
        "recommendations": all_recommendations,
        "data_disclosure": "Values marked 'estimated' are calculated using kW * operating duration. Values marked 'actual' derive from verified electrical utility meters."
    }), 200

@energy_bp.route("/energy/readings", methods=["POST"])
def record_meter_reading():
    """Records an actual physical electricity-meter reading for a room."""
    data = request.get_json() or {}
    room_id = data.get("room_id")
    actual_kwh = data.get("actual_kwh")

    if room_id is None or actual_kwh is None:
        return jsonify({"status": "error", "message": "room_id and actual_kwh are required."}), 400

    try:
        actual_kwh = float(actual_kwh)
    except ValueError:
        return jsonify({"status": "error", "message": "actual_kwh must be a valid number."}), 400

    db = next(get_db())
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        return jsonify({"status": "error", "message": f"Room {room_id} not found."}), 404

    # Calculate baseline estimate for comparison
    latest_occ = (
        db.query(OccupancyReading)
        .filter(OccupancyReading.room_id == room.id)
        .order_by(OccupancyReading.recorded_at.desc())
        .first()
    )
    people = latest_occ.people_count if latest_occ else 0
    power_calc = EnergyIntelligenceService.calculate_room_power_watts(room, people)
    est_kwh = EnergyIntelligenceService.estimate_energy_kwh(power_calc["effective_power_kw"], 1.0)

    reading = EnergyReading(
        room_id=room.id,
        estimated_kwh=est_kwh,
        actual_kwh=actual_kwh,
        source_type="meter_entry"
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)

    return jsonify({
        "status": "success",
        "message": "Physical meter reading recorded successfully.",
        "reading": reading.to_dict()
    }), 201

@energy_bp.route("/energy/history", methods=["GET"])
def get_energy_history():
    """Returns chronological energy history with estimated vs actual readings."""
    db = next(get_db())
    room_id = request.args.get("room_id", type=int)
    limit = min(200, request.args.get("limit", default=50, type=int))

    query = db.query(EnergyReading)
    if room_id:
        query = query.filter(EnergyReading.room_id == room_id)

    readings = query.order_by(EnergyReading.recorded_at.desc()).limit(limit).all()

    return jsonify({
        "status": "success",
        "total": len(readings),
        "readings": [r.to_dict() for r in readings]
    }), 200
