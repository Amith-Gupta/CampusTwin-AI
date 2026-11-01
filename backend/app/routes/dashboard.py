import logging
from datetime import datetime, timedelta
from flask import Blueprint, jsonify
from app.database import get_db
from app.models import Room, OccupancyReading, EnergyReading, Alert
from app.services.energy_service import EnergyIntelligenceService

logger = logging.getLogger(__name__)
dashboard_bp = Blueprint("dashboard", __name__)

@dashboard_bp.route("/dashboard/summary", methods=["GET"])
def get_dashboard_summary():
    """
    Returns high-level KPI cards, campus occupancy distribution,
    trend charts, and active alerts for the main dashboard.
    """
    db = next(get_db())
    rooms = db.query(Room).all()

    total_capacity = sum(r.capacity for r in rooms)
    total_people = 0
    total_effective_kw = 0.0

    status_counts = {"low": 0, "normal": 0, "high": 0, "full": 0}
    room_cards = []

    for r in rooms:
        latest_occ = (
            db.query(OccupancyReading)
            .filter(OccupancyReading.room_id == r.id)
            .order_by(OccupancyReading.recorded_at.desc())
            .first()
        )
        people = latest_occ.people_count if latest_occ else 0
        total_people += people

        r_dict = r.to_dict(current_occupancy=latest_occ)
        status_counts[r_dict["utilization_status"]] += 1
        room_cards.append(r_dict)

        power_calc = EnergyIntelligenceService.calculate_room_power_watts(r, people)
        total_effective_kw += power_calc["effective_power_kw"]

    campus_occ_pct = round((total_people / total_capacity * 100.0), 1) if total_capacity > 0 else 0.0
    avg_utilization_pct = round(sum(r["occupancy_percentage"] for r in room_cards) / max(1, len(room_cards)), 1)

    # Active alerts
    active_alerts = (
        db.query(Alert)
        .filter(Alert.status == "active")
        .order_by(Alert.created_at.desc())
        .limit(5)
        .all()
    )

    # 24-hour occupancy trend for the chart
    since = datetime.utcnow() - timedelta(hours=24)
    recent_readings = (
        db.query(OccupancyReading)
        .filter(OccupancyReading.recorded_at >= since)
        .order_by(OccupancyReading.recorded_at.asc())
        .all()
    )

    # Group by 2-hour buckets for smooth chart
    time_buckets = {}
    for reading in recent_readings:
        # Round to nearest 2 hours
        hour_bucket = (reading.recorded_at.hour // 2) * 2
        key = f"{hour_bucket:02d}:00"
        if key not in time_buckets:
            time_buckets[key] = {"hour": key, "total_people": 0, "count": 0}
        time_buckets[key]["total_people"] += reading.people_count
        time_buckets[key]["count"] += 1

    trend_chart = []
    for h in range(0, 24, 2):
        key = f"{h:02d}:00"
        if key in time_buckets and time_buckets[key]["count"] > 0:
            avg_val = int(round(time_buckets[key]["total_people"] / time_buckets[key]["count"]))
        else:
            # Baseline expectation for academic hours
            avg_val = int(total_capacity * 0.55) if 8 <= h <= 18 else int(total_capacity * 0.05)
        trend_chart.append({"time": key, "people": avg_val})

    return jsonify({
        "status": "success",
        "kpis": {
            "total_classrooms": len(rooms),
            "total_campus_capacity": total_capacity,
            "total_detected_people": total_people,
            "available_seats": max(0, total_capacity - total_people),
            "campus_occupancy_percentage": campus_occ_pct,
            "average_room_utilization": avg_utilization_pct,
            "estimated_energy_demand_kw": round(total_effective_kw, 2),
            "active_alerts_count": len(active_alerts)
        },
        "status_distribution": status_counts,
        "room_cards": room_cards,
        "occupancy_trend": trend_chart,
        "active_alerts": [a.to_dict() for a in active_alerts]
    }), 200
