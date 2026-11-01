import os
import cv2
import uuid
import base64
import logging
import numpy as np
from datetime import datetime
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from app.config import Config
from app.database import get_db
from app.models import Room, OccupancyReading, Alert, EnergyReading
from app.vision.detector import CampusVisionDetector
from app.ml.anomaly_detector import AnomalyDetector
from app.services.energy_service import EnergyIntelligenceService

logger = logging.getLogger(__name__)
detection_bp = Blueprint("detection", __name__)

# Global vision detector instance
_detector = None
def get_detector() -> CampusVisionDetector:
    global _detector
    if _detector is None:
        _detector = CampusVisionDetector()
    return _detector

# Active detection state tracker
active_detection_session = {
    "is_active": False,
    "room_id": None,
    "source_type": "none",  # webcam, video_upload, stream
    "started_at": None,
    "frames_processed": 0,
    "last_person_count": 0,
    "model_name": "YOLOv8n"
}

@detection_bp.route("/detection/status", methods=["GET"])
def detection_status():
    """Returns current live vision pipeline state."""
    detector = get_detector()
    active_detection_session["model_name"] = "YOLOv8n Pretrained" if detector.is_loaded else "OpenCV HOG Fallback"
    return jsonify({
        "status": "success",
        "session": active_detection_session,
        "detector": {
            "model_name": active_detection_session["model_name"],
            "is_loaded": detector.is_loaded,
            "conf_threshold": detector.conf_threshold,
            "target_class": "person (id: 0)",
            "active_isolated_trackers": len(detector.trackers)
        }
    }), 200

@detection_bp.route("/detection/benchmark", methods=["GET"])
def run_cv_benchmark():
    """
    Executes repeatable CV benchmark on labeled sample dataset.
    Measures wall-clock hardware FPS, person-count MAE, precision, and recall.
    """
    detector = get_detector()
    benchmark_res = detector.evaluate_benchmark()
    return jsonify({
        "status": "success",
        "benchmark": benchmark_res
    }), 200

@detection_bp.route("/detection/start", methods=["POST"])
def start_detection():
    """Starts live detection session for a specified room."""
    data = request.get_json() or {}
    room_id = data.get("room_id")
    source_type = data.get("source_type", "webcam")

    if not room_id:
        return jsonify({"status": "error", "message": "room_id is required to start detection."}), 400

    db = next(get_db())
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        return jsonify({"status": "error", "message": f"Room {room_id} not found."}), 404

    active_detection_session["is_active"] = True
    active_detection_session["room_id"] = room_id
    active_detection_session["source_type"] = source_type
    active_detection_session["started_at"] = datetime.utcnow().isoformat()
    active_detection_session["frames_processed"] = 0

    return jsonify({
        "status": "success",
        "message": f"Live person detection started for {room.building} - {room.room_number}.",
        "session": active_detection_session
    }), 200

@detection_bp.route("/detection/stop", methods=["POST"])
def stop_detection():
    """Stops the active live detection session."""
    active_detection_session["is_active"] = False
    active_detection_session["room_id"] = None
    active_detection_session["source_type"] = "none"

    return jsonify({
        "status": "success",
        "message": "Live detection stopped."
    }), 200

@detection_bp.route("/detection/frame", methods=["POST"])
def process_live_frame():
    """
    Receives a base64 encoded image frame from browser webcam,
    runs YOLO person detection, updates room occupancy, checks for anomalies,
    and returns bounding boxes + annotated image.
    """
    data = request.get_json() or {}
    image_b64 = data.get("image")
    room_id = data.get("room_id") or active_detection_session.get("room_id")
    conf_threshold = data.get("conf_threshold")

    if not image_b64:
        return jsonify({"status": "error", "message": "Missing 'image' base64 data in payload."}), 400

    try:
        # Strip data URL prefix if present
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]

        image_bytes = base64.b64decode(image_b64)
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({"status": "error", "message": "Could not decode image frame."}), 400

        detector = get_detector()
        stream_id = f"room_{room_id}" if room_id else "webcam_default"
        result = detector.detect_image(
            frame,
            draw_boxes=True,
            conf_threshold=conf_threshold,
            stream_id=stream_id
        )

        active_detection_session["frames_processed"] += 1
        active_detection_session["last_person_count"] = result.person_count

        room = None
        alert_info = None
        room_capacity = 0

        if room_id:
            try:
                db_gen = get_db()
                db = next(db_gen)
                try:
                    room_obj = db.query(Room).filter(Room.id == room_id).first()
                    if room_obj:
                        room_capacity = room_obj.capacity
                        # Calculate occupancy percentage
                        occ_pct = (result.person_count / room_obj.capacity * 100.0) if room_obj.capacity > 0 else 0.0

                        # Record occupancy reading
                        occ_record = OccupancyReading(
                            room_id=room_obj.id,
                            people_count=result.person_count,
                            occupancy_percentage=occ_pct,
                            source_type="live_webcam"
                        )
                        db.add(occ_record)

                        # Check for anomalies (overcapacity, unexpected off-hours occupancy)
                        anomaly_det = AnomalyDetector()
                        anomaly = anomaly_det.check_observation(
                            room_number=room_obj.room_number,
                            building=room_obj.building,
                            capacity=room_obj.capacity,
                            people_count=result.person_count,
                            operating_hours=room_obj.operating_hours,
                            estimated_kwh=None
                        )

                        if anomaly:
                            recent_alert = (
                                db.query(Alert)
                                .filter(
                                    Alert.room_id == room_obj.id,
                                    Alert.alert_type == anomaly["alert_type"],
                                    Alert.status == "active"
                                )
                                .first()
                            )
                            if not recent_alert:
                                new_alert = Alert(
                                    room_id=room_obj.id,
                                    alert_type=anomaly["alert_type"],
                                    mechanism=anomaly.get("mechanism", "rule_based"),
                                    technical_reason=anomaly.get("technical_reason"),
                                    anomaly_score=anomaly.get("anomaly_score"),
                                    severity=anomaly["severity"],
                                    description=anomaly["description"],
                                    observed_value=anomaly["observed_value"],
                                    expected_range=anomaly["expected_range"],
                                    status="active"
                                )
                                db.add(new_alert)
                                alert_info = new_alert.to_dict()

                        db.commit()
                finally:
                    try:
                        db_gen.close()
                    except Exception:
                        pass
            except Exception as dbe:
                logger.warning(f"Error persisting live occupancy observation: {dbe}")

        # Encode annotated image back to base64
        annotated_b64 = ""
        if result.annotated_image is not None:
            _, buffer = cv2.imencode(".jpg", result.annotated_image, [cv2.IMWRITE_JPEG_QUALITY, 75])
            annotated_b64 = "data:image/jpeg;base64," + base64.b64encode(buffer).decode("utf-8")

        return jsonify({
            "status": "success",
            "person_count": result.person_count,
            "detected_people_frame": result.person_count,
            "active_track_ids": result.active_track_ids,
            "cumulative_unique_tracks": result.cumulative_unique_tracks,
            "confidence_avg": result.confidence_avg,
            "detections": result.detections,
            "model_used": result.model_used,
            "is_fallback": result.is_fallback,
            "stream_id": result.stream_id,
            "annotated_frame": annotated_b64,
            "room_id": room_id,
            "occupancy_percentage": round((result.person_count / room_capacity * 100.0), 1) if room_capacity > 0 else 0.0,
            "alert": alert_info
        }), 200

    except Exception as e:
        logger.exception(f"Error processing frame: {e}")
        return jsonify({"status": "error", "message": f"Frame detection failed: {str(e)}"}), 500

@detection_bp.route("/detection/upload", methods=["POST"])
def upload_video_for_analysis():
    """
    Accepts video file upload, runs person detection across sampled frames,
    returns analytics timeline, peak occupancy, and records readings.
    """
    if "file" not in request.files:
        return jsonify({"status": "error", "message": "No 'file' field in multipart form-data."}), 400

    file = request.files["file"]
    room_id = request.form.get("room_id")

    if not file or not file.filename:
        return jsonify({"status": "error", "message": "No file selected."}), 400

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in Config.ALLOWED_VIDEO_EXTENSIONS:
        return jsonify({
            "status": "error",
            "message": f"Invalid video format '.{ext}'. Allowed: {', '.join(Config.ALLOWED_VIDEO_EXTENSIONS)}"
        }), 400

    Config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    filename = f"video_{uuid.uuid4().hex[:8]}_{secure_filename(file.filename)}"
    save_path = Config.UPLOAD_FOLDER / filename
    file.save(str(save_path))

    try:
        detector = get_detector()
        analysis = detector.process_video_file(str(save_path), sample_fps=2.0, max_duration_sec=60.0)

        # Log to room if room_id provided
        db = next(get_db())
        room = db.query(Room).filter(Room.id == int(room_id)).first() if room_id else None

        if room:
            avg_people = int(round(analysis["average_people_count"]))
            occ_pct = (avg_people / room.capacity * 100.0) if room.capacity > 0 else 0.0

            occ_rec = OccupancyReading(
                room_id=room.id,
                people_count=avg_people,
                occupancy_percentage=occ_pct,
                source_type="video_upload"
            )
            db.add(occ_rec)
            db.commit()

        # Clean up temporary video file
        try:
            if save_path.exists():
                os.remove(str(save_path))
        except Exception:
            pass

        return jsonify({
            "status": "success",
            "filename": file.filename,
            "room_id": room.id if room else None,
            "room_name": f"{room.building} - {room.room_number}" if room else None,
            "analysis": analysis
        }), 200

    except Exception as e:
        logger.exception(f"Video analysis error: {e}")
        return jsonify({"status": "error", "message": f"Failed to analyze video: {str(e)}"}), 500
