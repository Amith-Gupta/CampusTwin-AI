import time
import logging
from flask import Blueprint, jsonify
from app.config import Config
from app.database import get_db
from app.models import Room, OccupancyReading, Alert

logger = logging.getLogger(__name__)
health_bp = Blueprint("health", __name__)
server_start_time = time.time()

@health_bp.route("/health", methods=["GET"])
def health_check():
    """Returns application health, database connectivity, and engine states."""
    db_ok = False
    try:
        db = next(get_db())
        db.query(Room).first()
        db_ok = True
    except Exception as e:
        logger.warning(f"Database check failed: {e}")

    # Check detector status from shared singleton
    try:
        from app.routes.detection import get_detector
        detector = get_detector()
        detector_loaded = detector.is_loaded
        model_name = detector.model_name if detector_loaded else "OpenCV HOG Fallback"
    except Exception:
        detector_loaded = False
        model_name = "Not Loaded"

    is_healthy = db_ok

    return jsonify({
        "status": "healthy" if is_healthy else "degraded",
        "service": "CampusTwin AI Backend",
        "version": "1.0.0",
        "uptime_seconds": int(time.time() - server_start_time),
        "database": {
            "connected": db_ok,
            "dialect": "sqlite",
            "path": str(Config.DATABASE_PATH.name)
        },
        "vision_engine": {
            "loaded": detector_loaded,
            "model_name": model_name,
            "device": "cpu"
        }
    }), 200

@health_bp.route("/system/status", methods=["GET"])
def system_status():
    """Returns detailed diagnostics of rooms, ML metrics, and data sources."""
    db = next(get_db())
    total_rooms = db.query(Room).count()
    total_occupancy_records = db.query(OccupancyReading).count()
    active_alerts = db.query(Alert).filter(Alert.status == "active").count()

    from app.ml.forecaster import OccupancyForecaster
    forecaster = OccupancyForecaster()

    return jsonify({
        "total_classrooms": total_rooms,
        "total_occupancy_records": total_occupancy_records,
        "active_alerts_count": active_alerts,
        "forecasting_model": {
            "is_trained": forecaster.model is not None,
            "metrics": forecaster.metrics
        },
        "supported_sources": ["live_webcam", "video_upload", "demo_data"],
        "operating_mode": "Local / Privacy-First"
    }), 200
