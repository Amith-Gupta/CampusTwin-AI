import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables
load_dotenv(BASE_DIR / ".env")

class Config:
    """Backend application configuration for CampusTwin AI."""
    SECRET_KEY = os.getenv("SECRET_KEY", "campustwin-ai-secret-key-2026")
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    PORT = int(os.getenv("PORT", 5000))
    DEBUG = os.getenv("FLASK_ENV") == "development"

    # Database (PostgreSQL or SQLite with persistent disk fallback)
    raw_db_url = os.getenv("DATABASE_URL")
    DATABASE_PATH = BASE_DIR / "campustwin.db"
    if raw_db_url:
        if raw_db_url.startswith("postgres://"):
            DATABASE_URL = raw_db_url.replace("postgres://", "postgresql://", 1)
        else:
            DATABASE_URL = raw_db_url
    else:
        DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

    # Storage paths
    UPLOAD_FOLDER = BASE_DIR / "uploads"
    MODEL_FOLDER = BASE_DIR / "models"
    DATASET_FOLDER = BASE_DIR.parent / "datasets"
    SAMPLE_FOLDER = DATASET_FOLDER / "sample"

    # Computer Vision & Detection
    YOLO_MODEL_NAME = os.getenv("YOLO_MODEL_NAME", "yolov8n.pt")
    YOLO_CONFIDENCE_THRESHOLD = float(os.getenv("YOLO_CONFIDENCE_THRESHOLD", 0.35))
    YOLO_IOU_THRESHOLD = float(os.getenv("YOLO_IOU_THRESHOLD", 0.45))
    PERSON_CLASS_ID = 0  # COCO dataset class 0 is 'person'

    # Anomaly Detection & ML Defaults
    ANOMALY_CONTAMINATION = float(os.getenv("ANOMALY_CONTAMINATION", 0.05))
    FORECAST_HORIZON_HOURS = int(os.getenv("FORECAST_HORIZON_HOURS", 24))

    # CORS Allowed Origins
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if origin.strip()
    ]

    # Max upload limit (50 MB for video files)
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024
    ALLOWED_VIDEO_EXTENSIONS = {"mp4", "avi", "mov", "mkv", "webm"}
    ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
