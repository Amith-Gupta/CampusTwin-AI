import joblib
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, List, Optional, Tuple
from sklearn.ensemble import IsolationForest
from app.config import Config

logger = logging.getLogger(__name__)

class AnomalyDetector:
    """Isolation Forest anomaly detection for campus occupancy and energy patterns."""
    def __init__(self):
        self.model_path = Config.MODEL_FOLDER / "anomaly_detector.joblib"
        self.model: Optional[IsolationForest] = None
        self.contamination = Config.ANOMALY_CONTAMINATION
        self.feature_names = [
            "people_count",
            "occupancy_percentage",
            "hour",
            "is_weekend",
            "is_operating_hours",
            "estimated_kwh"
        ]
        self._load_model_if_exists()

    def _load_model_if_exists(self):
        if self.model_path.exists():
            try:
                saved = joblib.load(self.model_path)
                self.model = saved.get("model")
                logger.info("Successfully loaded existing Isolation Forest from disk.")
            except Exception as e:
                logger.warning(f"Could not load Isolation Forest ({e}).")

    def train(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Trains Isolation Forest on historical regular campus behavior."""
        if df.empty or len(df) < 25:
            return {"success": False, "message": "Need at least 25 readings to fit anomaly baseline."}

        df = df.copy()
        if "recorded_at" in df.columns:
            df["recorded_at"] = pd.to_datetime(df["recorded_at"])
        df["hour"] = df["recorded_at"].dt.hour
        df["is_weekend"] = (df["recorded_at"].dt.dayofweek >= 5).astype(int)
        df["is_operating_hours"] = ((df["hour"] >= 8) & (df["hour"] <= 18)).astype(int)

        if "estimated_kwh" not in df.columns:
            df["estimated_kwh"] = df["people_count"] * 0.15 + 1.2

        X = df[self.feature_names]

        model = IsolationForest(
            n_estimators=100,
            contamination=self.contamination,
            random_state=42
        )
        model.fit(X)
        self.model = model

        Config.MODEL_FOLDER.mkdir(parents=True, exist_ok=True)
        joblib.dump({"model": self.model, "trained_at": datetime.utcnow().isoformat()}, self.model_path)

        logger.info("Isolation Forest anomaly model trained successfully.")
        return {"success": True, "message": "Anomaly detection baseline calibrated successfully."}

    def check_observation(
        self,
        room_number: str,
        building: str,
        capacity: int,
        people_count: int,
        operating_hours: str = "08:00 - 18:00",
        estimated_kwh: float = 0.0,
        recorded_at: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Combines rule-based physics checks with Isolation Forest score
        to identify actionable occupancy and energy anomalies.
        """
        timestamp = recorded_at or datetime.utcnow()
        hour = timestamp.hour
        dow = timestamp.weekday()
        is_weekend = (dow >= 5)

        # Parse operating hours (e.g. "08:00 - 18:00")
        try:
            start_str, end_str = [s.strip() for s in operating_hours.split("-")]
            start_hr = int(start_str.split(":")[0])
            end_hr = int(end_str.split(":")[0])
            is_operating = (start_hr <= hour < end_hr) and not is_weekend
        except Exception:
            is_operating = (8 <= hour <= 18) and not is_weekend

        occ_pct = (people_count / capacity * 100.0) if capacity > 0 else 0.0

        # Rule 1: Overcapacity Hazard
        if people_count > capacity:
            excess = people_count - capacity
            return {
                "alert_type": "overcapacity",
                "severity": "critical" if excess > 10 else "high",
                "description": f"{building} - {room_number} exceeded fire capacity limit by {excess} people ({int(occ_pct)}% capacity).",
                "observed_value": float(people_count),
                "expected_range": f"0 - {capacity} people"
            }

        # Rule 2: Out of Operating Hours Presence
        if not is_operating and people_count >= 5:
            return {
                "alert_type": "out_of_hours_occupancy",
                "severity": "high" if (hour < 5 or hour > 22) else "medium",
                "description": f"Unexpected occupancy of {people_count} people in {building} - {room_number} during non-operating hours ({timestamp.strftime('%I:%M %p')}).",
                "observed_value": float(people_count),
                "expected_range": "0 - 4 people"
            }

        # Rule 3: Energy Spike with Zero Occupancy
        if people_count == 0 and estimated_kwh > 4.0:
            return {
                "alert_type": "energy_spike",
                "severity": "medium",
                "description": f"High energy demand ({estimated_kwh:.2f} kWh) detected in vacant room {building} - {room_number}. Equipment may have been left running.",
                "observed_value": float(estimated_kwh),
                "expected_range": "0.2 - 1.0 kWh"
            }

        # Model-based statistical check via Isolation Forest
        if self.model is not None:
            feat = pd.DataFrame([{
                "people_count": people_count,
                "occupancy_percentage": occ_pct,
                "hour": hour,
                "is_weekend": int(is_weekend),
                "is_operating_hours": int(is_operating),
                "estimated_kwh": estimated_kwh
            }])[self.feature_names]

            pred = self.model.predict(feat)[0]  # -1 for anomaly, 1 for normal
            if pred == -1:
                score = float(self.model.decision_function(feat)[0])
                return {
                    "alert_type": "statistical_occupancy_anomaly",
                    "severity": "low",
                    "description": f"Unusual occupancy pattern detected in {building} - {room_number} (anomaly deviation score: {score:.3f}).",
                    "observed_value": float(people_count),
                    "expected_range": f"Standard {capacity * 0.4:.0f} - {capacity * 0.75:.0f} range"
                }

        return None
