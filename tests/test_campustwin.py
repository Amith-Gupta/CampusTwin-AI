import os
import io
import cv2
import base64
import pytest
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pathlib import Path

# Add backend directory to sys.path
import sys
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app import create_app
from app.config import Config
from app.database import init_db, get_db
from app.models import Room, OccupancyReading, EnergyReading, Alert, Equipment, ModelMetric
from app.vision.detector import CampusVisionDetector
from app.ml.forecaster import OccupancyForecaster
from app.ml.anomaly_detector import AnomalyDetector
from app.services.energy_service import EnergyIntelligenceService

@pytest.fixture(scope="module")
def app():
    # Use isolated test file for SQLite persistence across requests
    test_db_path = backend_dir / "test_campustwin.db"
    if test_db_path.exists():
        try:
            os.remove(test_db_path)
        except Exception:
            pass

    test_db_url = f"sqlite:///{test_db_path}"
    app_instance = create_app()
    app_instance.config.update({
        "TESTING": True,
        "DATABASE_URL": test_db_url,
    })
    with app_instance.app_context():
        init_db(test_db_url)
        yield app_instance

    if test_db_path.exists():
        try:
            os.remove(test_db_path)
        except Exception:
            pass

@pytest.fixture(scope="module")
def client(app):
    return app.test_client()

# 1. Health and System Status Tests
def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] in ["healthy", "degraded"]
    assert "service" in data
    assert "vision_engine" in data

def test_system_status_endpoint(client):
    res = client.get("/api/system/status")
    assert res.status_code == 200
    data = res.get_json()
    assert "total_classrooms" in data
    assert "forecasting_model" in data

# 2. Room CRUD Operations
def test_create_room(client):
    payload = {
        "building": "Test Complex",
        "room_number": "TEST-101",
        "capacity": 50,
        "room_type": "Lecture Hall",
        "camera_source": "webcam_0",
        "operating_hours": "08:00 - 18:00"
    }
    res = client.post("/api/rooms", json=payload)
    assert res.status_code == 201
    data = res.get_json()
    assert data["status"] == "success"
    assert data["room"]["room_number"] == "TEST-101"

def test_get_rooms_and_details(client):
    res = client.get("/api/rooms")
    assert res.status_code == 200
    data = res.get_json()
    assert data["total"] >= 1
    room_id = data["rooms"][0]["id"]

    res_detail = client.get(f"/api/rooms/{room_id}")
    assert res_detail.status_code == 200
    assert "equipment" in res_detail.get_json()["room"]

def test_update_room(client):
    res = client.get("/api/rooms")
    room_id = res.get_json()["rooms"][0]["id"]
    res_up = client.put(f"/api/rooms/{room_id}", json={"capacity": 55})
    assert res_up.status_code == 200
    assert res_up.get_json()["room"]["capacity"] == 55

# 3. Occupancy Calculations & Categorization
def test_occupancy_percentage_calculation():
    room = Room(building="Hall A", room_number="101", capacity=50)
    # Test Low (<30%)
    occ_low = room.to_dict(current_occupancy=OccupancyReading(people_count=10))
    assert occ_low["occupancy_percentage"] == 20.0
    assert occ_low["utilization_status"] == "low"
    assert occ_low["available_seats"] == 40

    # Test Normal (30-75%)
    occ_norm = room.to_dict(current_occupancy=OccupancyReading(people_count=25))
    assert occ_norm["occupancy_percentage"] == 50.0
    assert occ_norm["utilization_status"] == "normal"

    # Test High (75-99%)
    occ_high = room.to_dict(current_occupancy=OccupancyReading(people_count=45))
    assert occ_high["occupancy_percentage"] == 90.0
    assert occ_high["utilization_status"] == "high"

    # Test Full (100%+)
    occ_full = room.to_dict(current_occupancy=OccupancyReading(people_count=52))
    assert occ_full["occupancy_percentage"] == 104.0
    assert occ_full["utilization_status"] == "full"
    assert occ_full["available_seats"] == 0

# 4. Camera Start & Stop Controls
def test_camera_lifecycle(client):
    res = client.get("/api/rooms")
    room_id = res.get_json()["rooms"][0]["id"]

    # Start detection
    start_res = client.post("/api/detection/start", json={"room_id": room_id, "source_type": "webcam"})
    assert start_res.status_code == 200
    assert start_res.get_json()["session"]["is_active"] is True

    # Status check
    stat_res = client.get("/api/detection/status")
    assert stat_res.status_code == 200
    assert stat_res.get_json()["session"]["is_active"] is True

    # Stop detection
    stop_res = client.post("/api/detection/stop")
    assert stop_res.status_code == 200

# 5. Computer Vision: Person Detection on Synthetic Frame
def test_person_detection_pipeline():
    detector = CampusVisionDetector()
    sample_img_path = Path(__file__).resolve().parent.parent / "datasets" / "sample" / "person_test.jpg"
    if sample_img_path.exists():
        img = cv2.imread(str(sample_img_path))
        result = detector.detect_image(img, draw_boxes=True)
        assert result.person_count >= 0
        assert isinstance(result.detections, list)
        assert result.model_used is not None

def test_empty_room_detection():
    detector = CampusVisionDetector()
    empty_img_path = Path(__file__).resolve().parent.parent / "datasets" / "sample" / "empty_room.jpg"
    if empty_img_path.exists():
        img = cv2.imread(str(empty_img_path))
        result = detector.detect_image(img, draw_boxes=False)
        assert result.person_count == 0

# 6. Video Processing & Timeline
def test_video_file_analysis():
    detector = CampusVisionDetector()
    video_path = Path(__file__).resolve().parent.parent / "datasets" / "sample" / "classroom_sample.mp4"
    if video_path.exists():
        res = detector.process_video_file(str(video_path), sample_fps=2.0, max_duration_sec=10.0)
        assert "average_people_count" in res
        assert "peak_people_count" in res
        assert "timeline" in res
        assert len(res["timeline"]) > 0

# 7. Upload Restrictions & Invalid Video Rejection
def test_invalid_video_upload_rejected(client):
    # Upload text file disguised as video
    data = {
        "file": (io.BytesIO(b"Not an actual video"), "corrupt_file.txt")
    }
    res = client.post("/api/detection/upload", data=data, content_type="multipart/form-data")
    assert res.status_code == 400
    assert "Invalid video format" in res.get_json()["message"]

# 8. Energy Calculations (kW * Hours)
def test_energy_calculation_formula():
    room = Room(building="Sci Block", room_number="101", capacity=50)
    # Add 4 LED lights (40W) and 1 AC (2000W) = 2160W base
    room.equipment_items = [
        Equipment(equipment_name="LED", quantity=4, power_rating_watts=40.0, is_active=True),
        Equipment(equipment_name="AC", quantity=1, power_rating_watts=2000.0, is_active=True)
    ]
    # Calculate power with 20 occupants (20 * 85W thermal = 1700W)
    power_info = EnergyIntelligenceService.calculate_room_power_watts(room, current_people=20)
    assert power_info["base_equipment_watts"] == 2160.0
    assert power_info["occupant_thermal_load_watts"] == 1700.0
    assert power_info["effective_power_watts"] == 3860.0
    assert power_info["effective_power_kw"] == 3.86

    # Energy in 2 hours = 3.86 * 2 = 7.72 kWh
    kwh = EnergyIntelligenceService.estimate_energy_kwh(power_info["effective_power_kw"], 2.0)
    assert kwh == 7.72

# 9. Energy Utility Meter Entry
def test_record_meter_reading(client):
    res = client.get("/api/rooms")
    room_id = res.get_json()["rooms"][0]["id"]

    res_meter = client.post("/api/energy/readings", json={"room_id": room_id, "actual_kwh": 12.45})
    assert res_meter.status_code == 201
    assert res_meter.get_json()["reading"]["actual_kwh"] == 12.45

# 10. Machine Learning Forecaster Training
def test_forecaster_training_and_chronological_split():
    forecaster = OccupancyForecaster()
    # Create synthetic chronological dataset
    now = datetime.utcnow()
    records = []
    for i in range(60):
        records.append({
            "room_id": 1,
            "people_count": int(20 + 10 * np.sin(i / 5.0)),
            "recorded_at": (now - timedelta(hours=60 - i)).isoformat(),
            "capacity": 40
        })
    df = pd.DataFrame(records)

    train_res = forecaster.train(df)
    assert train_res["success"] is True
    assert "mae" in train_res["metrics"]
    assert "rmse" in train_res["metrics"]
    assert "r2_score" in train_res["metrics"]

# 11. Forecaster Predictions & Bounds
def test_forecaster_future_projections():
    forecaster = OccupancyForecaster()
    preds = forecaster.predict_future_horizon(room_id=1, room_capacity=40, horizon_hours=24, current_occupancy=15)
    assert len(preds) == 24
    for p in preds:
        assert "predicted_people" in p
        assert "lower_bound" in p
        assert "upper_bound" in p
        assert p["lower_bound"] <= p["predicted_people"] <= p["upper_bound"]

# 12. Anomaly Detection Rules & Alerts
def test_anomaly_detection_rules():
    ad = AnomalyDetector()

    # Rule 1: Overcapacity
    alert_over = ad.check_observation("101", "Sci Block", capacity=40, people_count=48)
    assert alert_over is not None
    assert alert_over["alert_type"] == "overcapacity"
    assert alert_over["severity"] in ["high", "critical"]

    # Rule 2: Out of Operating Hours Occupancy (e.g., at 2:00 AM)
    night_time = datetime(2026, 11, 1, 2, 30, 0)
    alert_night = ad.check_observation("101", "Sci Block", capacity=40, people_count=12, operating_hours="08:00 - 18:00", recorded_at=night_time)
    assert alert_night is not None
    assert alert_night["alert_type"] == "out_of_hours_occupancy"

    # Rule 3: Energy Spike with Zero Occupancy
    alert_energy = ad.check_observation("101", "Sci Block", capacity=40, people_count=0, estimated_kwh=5.5)
    assert alert_energy is not None
    assert alert_energy["alert_type"] == "energy_spike"

# 13. Alert Acknowledgment
def test_alert_acknowledgement(client):
    db = next(get_db())
    room = db.query(Room).first()
    alert = Alert(
        room_id=room.id,
        alert_type="overcapacity",
        severity="high",
        description="Test alert overcapacity",
        status="active"
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)

    res = client.post(f"/api/alerts/{alert.id}/acknowledge")
    assert res.status_code == 200
    assert res.get_json()["alert"]["status"] == "acknowledged"

# 14. Empty Dataset Handling
def test_forecaster_empty_dataset_rejection():
    forecaster = OccupancyForecaster()
    empty_df = pd.DataFrame()
    train_res = forecaster.train(empty_df)
    assert train_res["success"] is False
    assert "Insufficient" in train_res["message"]

# 15. Delete Room Cleanup
def test_delete_room(client):
    res_rooms = client.get("/api/rooms")
    room_id = res_rooms.get_json()["rooms"][0]["id"]
    res_del = client.delete(f"/api/rooms/{room_id}")
    assert res_del.status_code == 200
