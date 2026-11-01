from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base

class Room(Base):
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    building = Column(String(100), nullable=False, index=True)
    room_number = Column(String(50), nullable=False, index=True)
    capacity = Column(Integer, nullable=False, default=30)
    room_type = Column(String(50), nullable=False, default="Lecture Hall")  # Lecture Hall, Laboratory, Seminar Room, Study Lounge
    camera_source = Column(String(100), nullable=False, default="webcam_0")  # webcam_0, uploaded_video, demo_feed
    operating_hours = Column(String(50), nullable=False, default="08:00 - 18:00")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    occupancy_readings = relationship("OccupancyReading", back_populates="room", cascade="all, delete-orphan")
    energy_readings = relationship("EnergyReading", back_populates="room", cascade="all, delete-orphan")
    equipment_items = relationship("Equipment", back_populates="room", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="room", cascade="all, delete-orphan")

    def to_dict(self, current_occupancy=None):
        latest_occ = current_occupancy
        people_count = latest_occ.people_count if latest_occ else 0
        occ_pct = (people_count / self.capacity * 100.0) if self.capacity > 0 else 0.0

        if occ_pct >= 100.0:
            status = "full"
        elif occ_pct >= 75.0:
            status = "high"
        elif occ_pct >= 30.0:
            status = "normal"
        else:
            status = "low"

        available_seats = max(0, self.capacity - people_count)

        return {
            "id": self.id,
            "building": self.building,
            "room_number": self.room_number,
            "name": f"{self.building} - {self.room_number}",
            "capacity": self.capacity,
            "room_type": self.room_type,
            "camera_source": self.camera_source,
            "operating_hours": self.operating_hours,
            "current_occupancy": people_count,
            "occupancy_percentage": round(occ_pct, 1),
            "available_seats": available_seats,
            "utilization_status": status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class OccupancyReading(Base):
    __tablename__ = "occupancy"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    people_count = Column(Integer, nullable=False, default=0)
    occupancy_percentage = Column(Float, nullable=False, default=0.0)
    source_type = Column(String(50), nullable=False, default="live_webcam")  # live_webcam, video_upload, demo_data
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)

    room = relationship("Room", back_populates="occupancy_readings")

    def to_dict(self):
        return {
            "id": self.id,
            "room_id": self.room_id,
            "people_count": self.people_count,
            "occupancy_percentage": round(self.occupancy_percentage, 1),
            "source_type": self.source_type,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
        }


class Equipment(Base):
    __tablename__ = "equipment"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_name = Column(String(100), nullable=False)  # e.g., "LED Panel", "Split AC 2-Ton", "Ceiling Fan", "Projector", "PC Workstation"
    quantity = Column(Integer, nullable=False, default=1)
    power_rating_watts = Column(Float, nullable=False, default=100.0)
    is_active = Column(Boolean, default=True)

    room = relationship("Room", back_populates="equipment_items")

    def to_dict(self):
        return {
            "id": self.id,
            "room_id": self.room_id,
            "equipment_name": self.equipment_name,
            "quantity": self.quantity,
            "power_rating_watts": self.power_rating_watts,
            "total_power_watts": self.quantity * self.power_rating_watts,
            "is_active": self.is_active,
        }


class EnergyReading(Base):
    __tablename__ = "energy_readings"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    estimated_kwh = Column(Float, nullable=False, default=0.0)
    actual_kwh = Column(Float, nullable=True)  # Entered from real meter if available
    source_type = Column(String(50), nullable=False, default="calculated_estimate")  # calculated_estimate, meter_entry, demo_baseline
    recorded_at = Column(DateTime, default=datetime.utcnow, index=True)

    room = relationship("Room", back_populates="energy_readings")

    def to_dict(self):
        return {
            "id": self.id,
            "room_id": self.room_id,
            "estimated_kwh": round(self.estimated_kwh, 3),
            "actual_kwh": round(self.actual_kwh, 3) if self.actual_kwh is not None else None,
            "source_type": self.source_type,
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
        }


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    alert_type = Column(String(50), nullable=False)  # overcapacity, out_of_hours_occupancy, energy_spike, sudden_crowd_change
    mechanism = Column(String(50), nullable=False, default="rule_based")  # rule_based, ml_based, hybrid
    technical_reason = Column(Text, nullable=True)
    anomaly_score = Column(Float, nullable=True)
    severity = Column(String(20), nullable=False, default="medium")  # info, low, medium, high, critical
    description = Column(Text, nullable=False)
    observed_value = Column(Float, nullable=True)
    expected_range = Column(String(100), nullable=True)
    status = Column(String(20), nullable=False, default="active")  # active, acknowledged, resolved
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    room = relationship("Room", back_populates="alerts")

    def to_dict(self):
        return {
            "id": self.id,
            "room_id": self.room_id,
            "room_name": f"{self.room.building} - {self.room.room_number}" if self.room else "Unknown Room",
            "alert_type": self.alert_type,
            "mechanism": self.mechanism or "rule_based",
            "technical_reason": self.technical_reason,
            "anomaly_score": self.anomaly_score,
            "severity": self.severity,
            "description": self.description,
            "observed_value": self.observed_value,
            "expected_range": self.expected_range,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ModelMetric(Base):
    __tablename__ = "model_metrics"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(50), nullable=False, index=True)  # random_forest_forecaster, isolation_forest_anomaly
    metric_name = Column(String(50), nullable=False)  # mae, rmse, r2_score, training_samples, contamination
    metric_value = Column(Float, nullable=False)
    recorded_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "model_name": self.model_name,
            "metric_name": self.metric_name,
            "metric_value": round(self.metric_value, 4),
            "recorded_at": self.recorded_at.isoformat() if self.recorded_at else None,
        }
