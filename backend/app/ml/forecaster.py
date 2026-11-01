import os
import joblib
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple, Optional
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from app.config import Config

logger = logging.getLogger(__name__)

class OccupancyForecaster:
    """Random Forest regressor for classroom occupancy forecasting."""
    def __init__(self):
        self.model_path = Config.MODEL_FOLDER / "occupancy_forecaster.joblib"
        self.model: Optional[RandomForestRegressor] = None
        self.metrics: Dict[str, float] = {}
        self.feature_names = [
            "hour",
            "day_of_week",
            "is_weekend",
            "is_operating_hours",
            "room_capacity",
            "lag_1h",
            "lag_2h"
        ]
        self._load_model_if_exists()

    def _load_model_if_exists(self):
        if self.model_path.exists():
            try:
                saved = joblib.load(self.model_path)
                self.model = saved.get("model")
                self.metrics = saved.get("metrics", {})
                logger.info("Successfully loaded existing occupancy forecaster from disk.")
            except Exception as e:
                logger.warning(f"Could not load saved forecaster ({e}). Will need training.")

    def extract_features_from_df(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        """Prepares chronological feature matrix and target from historical observations."""
        df = df.copy()
        if "recorded_at" in df.columns:
            df["recorded_at"] = pd.to_datetime(df["recorded_at"])
            df = df.sort_values("recorded_at").reset_index(drop=True)

        df["hour"] = df["recorded_at"].dt.hour
        df["day_of_week"] = df["recorded_at"].dt.dayofweek
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
        df["is_operating_hours"] = ((df["hour"] >= 8) & (df["hour"] <= 18)).astype(int)

        if "capacity" not in df.columns:
            df["room_capacity"] = 40
        else:
            df["room_capacity"] = df["capacity"]

        # Lag features
        df["lag_1h"] = df.groupby("room_id")["people_count"].shift(1).fillna(0)
        df["lag_2h"] = df.groupby("room_id")["people_count"].shift(2).fillna(0)

        X = df[self.feature_names]
        y = df["people_count"]
        return X, y

    def train(self, historical_df: pd.DataFrame) -> Dict[str, Any]:
        """
        Trains the Random Forest model using chronological train/test splitting.
        Avoids future data leakage.
        """
        if historical_df.empty or len(historical_df) < 20:
            return {
                "success": False,
                "message": "Insufficient historical data (minimum 20 observations required).",
                "metrics": {}
            }

        X, y = self.extract_features_from_df(historical_df)

        # Chronological train-test split (80% train, 20% test)
        split_idx = int(len(X) * 0.8)
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

        model = RandomForestRegressor(
            n_estimators=100,
            max_depth=12,
            min_samples_split=4,
            random_state=42
        )
        model.fit(X_train, y_train)

        # Evaluate on chronological holdout test set
        y_pred = model.predict(X_test)
        mae = float(mean_absolute_error(y_test, y_pred))
        rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
        r2 = float(r2_score(y_test, y_pred)) if len(np.unique(y_test)) > 1 else 0.0

        self.model = model
        self.metrics = {
            "mae": round(mae, 2),
            "rmse": round(rmse, 2),
            "r2_score": round(max(0.0, r2), 3),
            "training_samples": len(X_train),
            "test_samples": len(X_test),
            "trained_at": datetime.utcnow().isoformat()
        }

        # Save to disk
        Config.MODEL_FOLDER.mkdir(parents=True, exist_ok=True)
        joblib.dump({"model": self.model, "metrics": self.metrics}, self.model_path)
        logger.info(f"Occupancy Forecaster trained: MAE={mae:.2f}, RMSE={rmse:.2f}, R2={r2:.2f}")

        return {
            "success": True,
            "message": "Occupancy forecasting model trained successfully on historical observations.",
            "metrics": self.metrics
        }

    def predict_future_horizon(
        self,
        room_id: int,
        room_capacity: int,
        horizon_hours: int = 24,
        current_occupancy: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Predicts hourly occupancy for the upcoming `horizon_hours` for a room.
        Propagates autoregressive lag values forward in time.
        """
        now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
        predictions = []

        last_1 = current_occupancy
        last_2 = current_occupancy

        for step in range(1, horizon_hours + 1):
            future_time = now + timedelta(hours=step)
            hr = future_time.hour
            dow = future_time.weekday()
            is_wknd = 1 if dow >= 5 else 0
            is_op = 1 if (8 <= hr <= 18) else 0

            if self.model is not None:
                feat = pd.DataFrame([{
                    "hour": hr,
                    "day_of_week": dow,
                    "is_weekend": is_wknd,
                    "is_operating_hours": is_op,
                    "room_capacity": room_capacity,
                    "lag_1h": last_1,
                    "lag_2h": last_2
                }])
                pred_val = float(self.model.predict(feat)[0])
            else:
                # Heuristic baseline if model not trained yet
                base_pct = 0.65 if (is_op and not is_wknd) else 0.05
                # Peak between 10am and 3pm
                if 10 <= hr <= 15 and not is_wknd:
                    base_pct = 0.85
                pred_val = base_pct * room_capacity

            # Clamp between 0 and room capacity
            pred_count = max(0, min(room_capacity, int(round(pred_val))))
            occ_pct = (pred_count / room_capacity * 100.0) if room_capacity > 0 else 0.0

            # Confidence bounds (+/- 1.5 * MAE or heuristic 10%)
            margin = int(self.metrics.get("mae", 2.0) * 1.5)
            lower_bound = max(0, pred_count - margin)
            upper_bound = min(room_capacity, pred_count + margin)

            predictions.append({
                "timestamp": future_time.isoformat(),
                "time_label": future_time.strftime("%a %I:%M %p"),
                "predicted_people": pred_count,
                "predicted_occupancy_pct": round(occ_pct, 1),
                "lower_bound": lower_bound,
                "upper_bound": upper_bound
            })

            # Update autoregressive lags
            last_2 = last_1
            last_1 = pred_count

        return predictions
