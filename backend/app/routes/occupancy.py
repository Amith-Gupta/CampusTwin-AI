import logging
import pandas as pd
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from sqlalchemy import func
from app.database import get_db
from app.models import Room, OccupancyReading, ModelMetric
from app.ml.forecaster import OccupancyForecaster

logger = logging.getLogger(__name__)
occupancy_bp = Blueprint("occupancy", __name__)

@occupancy_bp.route("/occupancy/history", methods=["GET"])
def get_occupancy_history():
    """
    Returns historical occupancy readings.
    Supports ?room_id=X&limit=100&days=7.
    Also returns hourly aggregated averages for Recharts charts.
    """
    db = next(get_db())
    room_id = request.args.get("room_id", type=int)
    limit = min(500, request.args.get("limit", default=100, type=int))
    days = request.args.get("days", default=7, type=int)

    query = db.query(OccupancyReading)
    if room_id:
        query = query.filter(OccupancyReading.room_id == room_id)

    since = datetime.utcnow() - timedelta(days=days)
    query = query.filter(OccupancyReading.recorded_at >= since)

    readings = query.order_by(OccupancyReading.recorded_at.desc()).limit(limit).all()

    # Calculate hourly average pattern (00:00 to 23:00)
    hourly_stats = {h: {"hour": f"{h:02d}:00", "count_sum": 0, "total_records": 0, "avg_people": 0, "avg_pct": 0} for h in range(24)}
    for r in readings:
        h = r.recorded_at.hour
        hourly_stats[h]["count_sum"] += r.people_count
        hourly_stats[h]["total_records"] += 1

    hourly_chart = []
    for h in range(24):
        item = hourly_stats[h]
        recs = item["total_records"]
        avg_p = round(item["count_sum"] / recs, 1) if recs > 0 else 0
        hourly_chart.append({
            "hour": item["hour"],
            "avg_people": avg_p,
            "observations": recs
        })

    return jsonify({
        "status": "success",
        "total_records": len(readings),
        "readings": [r.to_dict() for r in readings],
        "hourly_chart": hourly_chart
    }), 200

@occupancy_bp.route("/occupancy/record", methods=["POST"])
def record_occupancy():
    """Records a manual observation or sensor reading."""
    data = request.get_json() or {}
    room_id = data.get("room_id")
    people_count = data.get("people_count")

    if room_id is None or people_count is None:
        return jsonify({"status": "error", "message": "room_id and people_count are required."}), 400

    people_count = max(0, int(people_count))
    db = next(get_db())
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        return jsonify({"status": "error", "message": f"Room {room_id} not found."}), 404

    occ_pct = (people_count / room.capacity * 100.0) if room.capacity > 0 else 0.0

    reading = OccupancyReading(
        room_id=room.id,
        people_count=people_count,
        occupancy_percentage=occ_pct,
        source_type=data.get("source_type", "manual_entry")
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)

    return jsonify({"status": "success", "message": "Occupancy recorded.", "reading": reading.to_dict()}), 201

@occupancy_bp.route("/forecast/train", methods=["POST"])
def train_forecasting_model():
    """
    Extracts all historical occupancy observations from database,
    performs chronological train-test split, trains Random Forest model,
    saves metrics into MODEL_METRICS table.
    """
    db = next(get_db())
    records = db.query(
        OccupancyReading.room_id,
        OccupancyReading.people_count,
        OccupancyReading.recorded_at,
        Room.capacity
    ).join(Room, OccupancyReading.room_id == Room.id).all()

    if len(records) < 30:
        return jsonify({
            "status": "error",
            "message": f"Insufficient training data. Found {len(records)} readings; minimum 30 required for chronological split & interval calibration. Please seed demo data first."
        }), 400

    df = pd.DataFrame([{
        "room_id": r.room_id,
        "people_count": r.people_count,
        "recorded_at": r.recorded_at,
        "capacity": r.capacity
    } for r in records])

    forecaster = OccupancyForecaster()
    train_res = forecaster.train(df)

    if train_res.get("success"):
        # Save metrics to database
        for m_name, m_val in train_res["metrics"].items():
            if isinstance(m_val, (int, float)):
                metric_row = ModelMetric(
                    model_name="random_forest_forecaster",
                    metric_name=m_name,
                    metric_value=float(m_val)
                )
                db.add(metric_row)
        db.commit()

    return jsonify(train_res), 200

@occupancy_bp.route("/forecast", methods=["GET"])
def get_forecast():
    """
    Returns 24-hour occupancy forecast for a specific room or campus average.
    """
    db = next(get_db())
    room_id = request.args.get("room_id", type=int)
    horizon_hours = min(72, request.args.get("horizon_hours", default=24, type=int))

    room = None
    if room_id:
        room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        room = db.query(Room).first()

    if not room:
        return jsonify({"status": "error", "message": "No classrooms registered to forecast."}), 404

    latest_occ = (
        db.query(OccupancyReading)
        .filter(OccupancyReading.room_id == room.id)
        .order_by(OccupancyReading.recorded_at.desc())
        .first()
    )
    current_count = latest_occ.people_count if latest_occ else 0

    forecaster = OccupancyForecaster()
    predictions = forecaster.predict_future_horizon(
        room_id=room.id,
        room_capacity=room.capacity,
        horizon_hours=horizon_hours,
        current_occupancy=current_count
    )

    return jsonify({
        "status": "success",
        "room_id": room.id,
        "room_name": f"{room.building} - {room.room_number}",
        "room_capacity": room.capacity,
        "current_occupancy": current_count,
        "model_trained": forecaster.model is not None,
        "metrics": forecaster.metrics,
        "forecast": predictions
    }), 200
