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
    """
    Campus anomaly detection engine combining:
    1. Deterministic safety rules (overcapacity, off-hours facility presence, phantom idle draw).
    2. Statistical multivariate modeling via Scikit-learn Isolation Forest.
    3. Explicit classification of alert mechanism: 'rule_based', 'ml_based', or 'hybrid'.
    4. Repeatable evaluation benchmark computing precision, recall, and false-alert rate on labeled cases.
    """

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
        """Trains Isolation Forest baseline on typical campus operational patterns."""
        if df.empty or len(df) < 25:
            return {"success": False, "message": "Need at least 25 readings to calibrate anomaly baseline."}

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
        estimated_kwh: Optional[float] = None,
        recorded_at: Optional[datetime] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Evaluates an observation against deterministic facility rules and the Isolation Forest model.
        Returns None if normal, or an alert dict explicitly labeled with mechanism ('rule_based', 'ml_based', 'hybrid')
        and technical reason. Does not assert malicious intent or security incidents.
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
        kwh_val = float(estimated_kwh) if estimated_kwh is not None else (people_count * 0.08 + 0.5)

        rule_triggered = False
        rule_alert_type = None
        rule_severity = "low"
        rule_description = ""
        rule_expected = ""
        rule_reason = ""

        # Rule 1: Overcapacity Check
        if people_count > capacity:
            excess = people_count - capacity
            rule_triggered = True
            rule_alert_type = "overcapacity"
            rule_severity = "critical" if excess > 10 else "high"
            rule_description = f"{building} - {room_number} exceeded configured seating capacity by {excess} people ({int(occ_pct)}% capacity)."
            rule_expected = f"0 - {capacity} people"
            rule_reason = f"Occupancy ({people_count}) exceeds safe architectural room limit ({capacity})."

        # Rule 2: Out of Operating Hours Presence
        elif not is_operating and people_count >= 5:
            rule_triggered = True
            rule_alert_type = "out_of_hours_occupancy"
            rule_severity = "high" if (hour < 5 or hour > 22) else "medium"
            rule_description = f"Occupancy of {people_count} people in {building} - {room_number} during non-operating hours ({timestamp.strftime('%I:%M %p')})."
            rule_expected = "0 - 4 people"
            rule_reason = f"Facility is scheduled closed between {operating_hours}, but {people_count} occupants were detected."

        # Rule 3: Phantom Idle Energy Spike (if kWh provided)
        elif people_count == 0 and estimated_kwh is not None and estimated_kwh > 4.0:
            rule_triggered = True
            rule_alert_type = "energy_spike"
            rule_severity = "medium"
            rule_description = f"High electricity consumption ({estimated_kwh:.2f} kWh) detected in vacant room {building} - {room_number}."
            rule_expected = "0.2 - 1.0 kWh"
            rule_reason = "Classroom is vacant (0 occupants), yet connected power draw indicates active equipment running."

        # Isolation Forest Statistical Check
        ml_triggered = False
        ml_score = 0.0
        ml_reason = ""

        if self.model is not None:
            feat = pd.DataFrame([{
                "people_count": people_count,
                "occupancy_percentage": occ_pct,
                "hour": hour,
                "is_weekend": int(is_weekend),
                "is_operating_hours": int(is_operating),
                "estimated_kwh": kwh_val
            }])[self.feature_names]

            try:
                pred = self.model.predict(feat)[0]
                if pred == -1:
                    ml_triggered = True
                    ml_score = float(self.model.decision_function(feat)[0])
                    ml_reason = f"Isolation Forest flagged rare feature combination (decision score: {ml_score:.3f})."
            except Exception as e:
                logger.warning(f"Isolation Forest inference error: {e}")

        # Combine mechanisms
        if rule_triggered and ml_triggered:
            return {
                "alert_type": rule_alert_type,
                "mechanism": "hybrid",
                "severity": rule_severity,
                "description": f"[Hybrid: Rule + ML] {rule_description}",
                "technical_reason": f"{rule_reason} Confirmed by statistical outlier detection ({ml_reason}).",
                "observed_value": float(people_count if rule_alert_type != "energy_spike" else kwh_val),
                "expected_range": rule_expected,
                "anomaly_score": round(ml_score, 3)
            }
        elif rule_triggered:
            return {
                "alert_type": rule_alert_type,
                "mechanism": "rule_based",
                "severity": rule_severity,
                "description": rule_description,
                "technical_reason": rule_reason,
                "observed_value": float(people_count if rule_alert_type != "energy_spike" else kwh_val),
                "expected_range": rule_expected,
                "anomaly_score": None
            }
        elif ml_triggered:
            return {
                "alert_type": "statistical_occupancy_anomaly",
                "mechanism": "ml_based",
                "severity": "low",
                "description": f"Statistical occupancy anomaly in {building} - {room_number} ({people_count} people, {int(occ_pct)}% capacity).",
                "technical_reason": f"No deterministic rule breached, but pattern deviates from calibrated baseline. {ml_reason}",
                "observed_value": float(people_count),
                "expected_range": f"Historical norm ~{int(capacity * 0.3)}-{int(capacity * 0.7)}",
                "anomaly_score": round(ml_score, 3)
            }

        return None

    def evaluate_benchmark(self) -> Dict[str, Any]:
        """
        Evaluates anomaly detection performance against structured synthetic and realistic test cases.
        Calculates precision, recall, and false-alert rate (FPR).
        """
        test_cases = [
            # Case 1: Normal daytime lecture (Normal)
            {
                "name": "Normal Daytime Lecture",
                "capacity": 60,
                "people_count": 28,
                "hour": 14,
                "dow": 2,
                "kwh": 2.1,
                "ground_truth_anomaly": False
            },
            # Case 2: Normal empty night room (Normal)
            {
                "name": "Normal Empty Night Room",
                "capacity": 60,
                "people_count": 0,
                "hour": 3,
                "dow": 2,
                "kwh": 0.3,
                "ground_truth_anomaly": False
            },
            # Case 3: Overcapacity hazard (Anomaly - Rule + ML)
            {
                "name": "Overcapacity Fire Hazard",
                "capacity": 50,
                "people_count": 72,
                "hour": 11,
                "dow": 1,
                "kwh": 3.8,
                "ground_truth_anomaly": True
            },
            # Case 4: After-hours unbooked access (Anomaly - Rule + ML)
            {
                "name": "After-Hours Facility Presence",
                "capacity": 45,
                "people_count": 14,
                "hour": 2,
                "dow": 3,
                "kwh": 2.5,
                "ground_truth_anomaly": True
            },
            # Case 5: Normal morning tutorial (Normal)
            {
                "name": "Normal Morning Tutorial",
                "capacity": 40,
                "people_count": 18,
                "hour": 10,
                "dow": 0,
                "kwh": 1.6,
                "ground_truth_anomaly": False
            },
            # Case 6: Vacant room phantom equipment draw (Anomaly - Rule)
            {
                "name": "Vacant Room Phantom Draw",
                "capacity": 40,
                "people_count": 0,
                "hour": 15,
                "dow": 1,
                "kwh": 5.2,
                "ground_truth_anomaly": True
            }
        ]

        tp = 0
        fp = 0
        tn = 0
        fn = 0
        case_results = []

        for c in test_cases:
            dt = datetime(2026, 11, 2 + c["dow"], c["hour"], 15)
            alert = self.check_observation(
                room_number="BENCH-101",
                building="Benchmark Block",
                capacity=c["capacity"],
                people_count=c["people_count"],
                operating_hours="08:00 - 18:00",
                estimated_kwh=c["kwh"],
                recorded_at=dt
            )
            detected_anomaly = alert is not None
            gt = c["ground_truth_anomaly"]

            if detected_anomaly and gt:
                tp += 1
            elif detected_anomaly and not gt:
                fp += 1
            elif not detected_anomaly and not gt:
                tn += 1
            else:
                fn += 1

            case_results.append({
                "test_case": c["name"],
                "people_count": c["people_count"],
                "capacity": c["capacity"],
                "ground_truth_anomaly": gt,
                "detected_anomaly": detected_anomaly,
                "mechanism": alert.get("mechanism") if alert else "normal",
                "alert_type": alert.get("alert_type") if alert else None
            })

        precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
        false_alert_rate = fp / (fp + tn) if (fp + tn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 1.0

        return {
            "evaluation_status": "evaluated_on_labeled_scenarios",
            "data_origin": "synthetic_labeled_scenarios",
            "total_test_cases": len(test_cases),
            "true_positives": tp,
            "false_positives": fp,
            "true_negatives": tn,
            "false_negatives": fn,
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "false_alert_rate": round(false_alert_rate, 3),
            "f1_score": round(f1, 3),
            "detailed_cases": case_results
        }
