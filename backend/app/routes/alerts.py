import logging
from flask import Blueprint, request, jsonify
from app.database import get_db
from app.models import Alert, Room, OccupancyReading
from app.services.energy_service import EnergyIntelligenceService
from app.services.recommendation_service import CampusRecommendationEngine

logger = logging.getLogger(__name__)
alerts_bp = Blueprint("alerts", __name__)

@alerts_bp.route("/alerts", methods=["GET"])
def get_alerts():
    """Returns alerts with optional status and severity filtering."""
    db = next(get_db())
    status_filter = request.args.get("status")
    severity_filter = request.args.get("severity")
    room_id = request.args.get("room_id", type=int)

    query = db.query(Alert)
    if status_filter:
        query = query.filter(Alert.status == status_filter)
    if severity_filter:
        query = query.filter(Alert.severity == severity_filter)
    if room_id:
        query = query.filter(Alert.room_id == room_id)

    alerts = query.order_by(Alert.created_at.desc()).limit(100).all()

    return jsonify({
        "status": "success",
        "total": len(alerts),
        "alerts": [a.to_dict() for a in alerts]
    }), 200

@alerts_bp.route("/alerts/<int:alert_id>/acknowledge", methods=["POST"])
def acknowledge_alert(alert_id):
    """Marks an active alert as acknowledged."""
    db = next(get_db())
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        return jsonify({"status": "error", "message": f"Alert {alert_id} not found."}), 404

    alert.status = "acknowledged"
    db.commit()
    db.refresh(alert)

    return jsonify({
        "status": "success",
        "message": f"Alert {alert_id} acknowledged.",
        "alert": alert.to_dict()
    }), 200

@alerts_bp.route("/anomalies", methods=["GET"])
def get_anomalies():
    """Returns summary of anomaly triggers and statistics."""
    db = next(get_db())
    alerts = db.query(Alert).filter(Alert.status == "active").all()

    breakdown = {}
    for a in alerts:
        breakdown[a.alert_type] = breakdown.get(a.alert_type, 0) + 1

    return jsonify({
        "status": "success",
        "active_anomalies_count": len(alerts),
        "by_type": breakdown,
        "recent_anomalies": [a.to_dict() for a in alerts[:10]]
    }), 200

@alerts_bp.route("/alerts/benchmark", methods=["GET"])
def run_anomaly_benchmark():
    """Runs repeatability benchmark on labeled anomaly test cases."""
    from app.ml.anomaly_detector import AnomalyDetector
    detector = AnomalyDetector()
    results = detector.evaluate_benchmark()
    return jsonify({
        "status": "success",
        "benchmark": results
    }), 200

@alerts_bp.route("/recommendations", methods=["GET"])
def get_recommendations():
    """Generates rule-based smart recommendations derived from live database metrics."""
    db = next(get_db())
    rooms = db.query(Room).all()

    room_occupancies = {}
    room_powers = {}

    for r in rooms:
        latest_occ = (
            db.query(OccupancyReading)
            .filter(OccupancyReading.room_id == r.id)
            .order_by(OccupancyReading.recorded_at.desc())
            .first()
        )
        room_occupancies[r.id] = latest_occ
        people = latest_occ.people_count if latest_occ else 0
        power_calc = EnergyIntelligenceService.calculate_room_power_watts(r, people)
        room_powers[r.id] = power_calc["effective_power_kw"]

    recs = CampusRecommendationEngine.generate_campus_recommendations(rooms, room_occupancies, room_powers)

    return jsonify({
        "status": "success",
        "total_recommendations": len(recs),
        "recommendations": recs
    }), 200
