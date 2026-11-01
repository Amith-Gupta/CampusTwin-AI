import random
import logging
from datetime import datetime, timedelta
from flask import Blueprint, jsonify
from app.database import get_db
from app.models import Room, Equipment, OccupancyReading, EnergyReading, Alert, ModelMetric
from app.ml.forecaster import OccupancyForecaster
from app.ml.anomaly_detector import AnomalyDetector
from app.services.energy_service import EnergyIntelligenceService

logger = logging.getLogger(__name__)
seed_bp = Blueprint("seed", __name__)

SAMPLE_ROOMS = [
    {
        "building": "Science Block",
        "room_number": "SCI-101",
        "capacity": 60,
        "room_type": "Lecture Hall",
        "camera_source": "webcam_0",
        "operating_hours": "08:00 - 18:00",
        "equipment": [
            {"name": "LED Ceiling Panels", "quantity": 8, "watts": 40.0},
            {"name": "Ceiling Fans", "quantity": 6, "watts": 75.0},
            {"name": "Split AC 2-Ton", "quantity": 2, "watts": 2000.0},
            {"name": "Smart Projector", "quantity": 1, "watts": 350.0}
        ]
    },
    {
        "building": "Engineering Wing",
        "room_number": "ENG-204",
        "capacity": 45,
        "room_type": "Computer Lab",
        "camera_source": "uploaded_video",
        "operating_hours": "08:00 - 20:00",
        "equipment": [
            {"name": "LED Ceiling Panels", "quantity": 6, "watts": 40.0},
            {"name": "Split AC 2-Ton", "quantity": 2, "watts": 2200.0},
            {"name": "PC Workstations", "quantity": 40, "watts": 180.0},
            {"name": "Lab Server Rack", "quantity": 1, "watts": 600.0}
        ]
    },
    {
        "building": "Main Library",
        "room_number": "LIB-3A",
        "capacity": 30,
        "room_type": "Study Lounge",
        "camera_source": "demo_feed",
        "operating_hours": "08:00 - 22:00",
        "equipment": [
            {"name": "Dimmable LED Panels", "quantity": 6, "watts": 30.0},
            {"name": "HVAC Air Duct", "quantity": 1, "watts": 1500.0},
            {"name": "Study Table Power Outlets", "quantity": 15, "watts": 65.0}
        ]
    },
    {
        "building": "Academic Block B",
        "room_number": "AUD-B",
        "capacity": 150,
        "room_type": "Grand Auditorium",
        "camera_source": "demo_feed",
        "operating_hours": "09:00 - 18:00",
        "equipment": [
            {"name": "Stage Floodlights & Halogens", "quantity": 12, "watts": 100.0},
            {"name": "Central Chiller HVAC", "quantity": 1, "watts": 6500.0},
            {"name": "PA Sound System & Consoles", "quantity": 1, "watts": 800.0},
            {"name": "Dual Laser Projectors", "quantity": 2, "watts": 450.0}
        ]
    },
    {
        "building": "Management Block",
        "room_number": "MBA-12",
        "capacity": 35,
        "room_type": "Executive Seminar",
        "camera_source": "webcam_0",
        "operating_hours": "08:30 - 17:30",
        "equipment": [
            {"name": "Recessed Warm LEDs", "quantity": 6, "watts": 35.0},
            {"name": "Split AC 1.5-Ton", "quantity": 2, "watts": 1600.0},
            {"name": "Video Conference Display", "quantity": 1, "watts": 220.0}
        ]
    }
]

@seed_bp.route("/seed/demo-data", methods=["POST"])
def seed_demo_data():
    """
    Seeds comprehensive realistic campus data:
    5 classrooms with equipment, 14 days of realistic hourly occupancy observations,
    corresponding energy calculations, and calibrated ML models.
    """
    db = next(get_db())

    # Check if already seeded
    existing_rooms_count = db.query(Room).count()
    if existing_rooms_count > 0:
        # Clear existing data to allow clean re-seed
        db.query(Alert).delete()
        db.query(EnergyReading).delete()
        db.query(OccupancyReading).delete()
        db.query(Equipment).delete()
        db.query(ModelMetric).delete()
        db.query(Room).delete()
        db.commit()

    created_rooms = []
    for r_info in SAMPLE_ROOMS:
        room = Room(
            building=r_info["building"],
            room_number=r_info["room_number"],
            capacity=r_info["capacity"],
            room_type=r_info["room_type"],
            camera_source=r_info["camera_source"],
            operating_hours=r_info["operating_hours"],
            created_at=datetime.utcnow() - timedelta(days=15)
        )
        db.add(room)
        db.commit()
        db.refresh(room)
        created_rooms.append(room)

        # Add equipment
        for eq_data in r_info["equipment"]:
            eq = Equipment(
                room_id=room.id,
                equipment_name=eq_data["name"],
                quantity=eq_data["quantity"],
                power_rating_watts=eq_data["watts"],
                is_active=True
            )
            db.add(eq)
        db.commit()

    # Generate 14 days of realistic hourly history for each room
    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    total_records = 0

    for room in created_rooms:
        cap = room.capacity
        for day_offset in range(14, -1, -1):
            day_date = now - timedelta(days=day_offset)
            is_weekend = (day_date.weekday() >= 5)

            for hour in range(0, 24):
                record_time = day_date.replace(hour=hour)

                # Realistic academic day curve
                if is_weekend:
                    # Weekend: 0 to 10%
                    p_ratio = random.uniform(0.0, 0.12) if 10 <= hour <= 17 else 0.0
                else:
                    # Weekday
                    if 9 <= hour <= 12:  # Morning lectures
                        p_ratio = random.uniform(0.65, 0.95)
                    elif hour == 13:      # Lunch drop
                        p_ratio = random.uniform(0.20, 0.40)
                    elif 14 <= hour <= 17: # Afternoon labs/classes
                        p_ratio = random.uniform(0.55, 0.88)
                    elif 18 <= hour <= 20: # Evening study/clubs
                        p_ratio = random.uniform(0.15, 0.35) if "LIB" in room.room_number or "ENG" in room.room_number else 0.05
                    else:
                        p_ratio = 0.0  # Closed hours

                people = int(round(cap * p_ratio))
                # Slight noise
                people = max(0, min(cap, people + random.randint(-2, 2) if people > 0 else 0))
                occ_pct = (people / cap * 100.0) if cap > 0 else 0.0

                occ = OccupancyReading(
                    room_id=room.id,
                    people_count=people,
                    occupancy_percentage=occ_pct,
                    source_type="demo_data",
                    recorded_at=record_time
                )
                db.add(occ)

                # Calculate estimated energy for the hour
                power_calc = EnergyIntelligenceService.calculate_room_power_watts(room, people)
                est_kwh = EnergyIntelligenceService.estimate_energy_kwh(power_calc["effective_power_kw"], 1.0)

                # Simulate occasional actual meter reading with slight random meter variance (+/- 4%)
                actual_kwh = None
                if random.random() < 0.25:
                    actual_kwh = round(est_kwh * random.uniform(0.96, 1.05), 3)

                nrg = EnergyReading(
                    room_id=room.id,
                    estimated_kwh=est_kwh,
                    actual_kwh=actual_kwh,
                    source_type="demo_baseline",
                    recorded_at=record_time
                )
                db.add(nrg)
                total_records += 1

    db.commit()

    # Seed 3 representative demonstration alerts
    sample_alerts = [
        {
            "room_id": created_rooms[0].id,
            "type": "overcapacity",
            "severity": "high",
            "desc": f"{created_rooms[0].building} - {created_rooms[0].room_number} exceeded fire capacity limit by 5 people during guest seminar.",
            "obs": 65.0,
            "range": "0 - 60 people"
        },
        {
            "room_id": created_rooms[1].id,
            "type": "out_of_hours_occupancy",
            "severity": "medium",
            "desc": f"Unexpected occupancy of 12 students in {created_rooms[1].building} - {created_rooms[1].room_number} at 02:30 AM (hackathon project).",
            "obs": 12.0,
            "range": "0 - 4 people"
        },
        {
            "room_id": created_rooms[4].id,
            "type": "energy_spike",
            "severity": "medium",
            "desc": f"High energy demand (3.2 kW) detected in vacant room {created_rooms[4].building} - {created_rooms[4].room_number}. AC units left operating overnight.",
            "obs": 3.2,
            "range": "0.2 - 0.8 kW"
        }
    ]

    for a in sample_alerts:
        alert = Alert(
            room_id=a["room_id"],
            alert_type=a["type"],
            severity=a["severity"],
            description=a["desc"],
            observed_value=a["obs"],
            expected_range=a["range"],
            status="active",
            created_at=datetime.utcnow() - timedelta(hours=random.randint(2, 18))
        )
        db.add(alert)
    db.commit()

    # Train Random Forest forecaster and Isolation Forest on this new data
    try:
        import pandas as pd
        records = db.query(
            OccupancyReading.room_id,
            OccupancyReading.people_count,
            OccupancyReading.recorded_at,
            Room.capacity
        ).join(Room, OccupancyReading.room_id == Room.id).all()

        df = pd.DataFrame([{
            "room_id": r.room_id,
            "people_count": r.people_count,
            "occupancy_percentage": (r.people_count / r.capacity * 100.0) if r.capacity > 0 else 0.0,
            "recorded_at": r.recorded_at,
            "capacity": r.capacity
        } for r in records])

        forecaster = OccupancyForecaster()
        forecaster.train(df)

        anomaly_detector = AnomalyDetector()
        anomaly_detector.train(df)
        logger.info("Successfully calibrated ML models during demo seeding.")
    except Exception as e:
        logger.warning(f"Could not calibrate ML models during seed: {e}")

    return jsonify({
        "status": "success",
        "message": f"Successfully seeded {len(created_rooms)} campus classrooms and {total_records} hourly occupancy & energy observations.",
        "rooms_created": len(created_rooms),
        "total_readings_generated": total_records
    }), 201
