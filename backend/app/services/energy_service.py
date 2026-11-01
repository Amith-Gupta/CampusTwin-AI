import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.models import Room, Equipment, EnergyReading

logger = logging.getLogger(__name__)

class EnergyIntelligenceService:
    """Calculates estimated electrical energy demand and compares with actual readings."""

    @staticmethod
    def calculate_room_power_watts(room: Room, current_people: int) -> Dict[str, Any]:
        """
        Calculates active power load in Watts for a classroom.
        Equipment (Lights, Fans, ACs, PCs) power + Occupancy-scaled thermal HVAC load.
        Formula:
          Total Power (W) = Baseline Equipment Power + (Occupancy * Thermal Load Watts)
        """
        base_equipment_watts = 0.0
        equipment_breakdown = []

        for eq in room.equipment_items:
            if not eq.is_active:
                continue

            eq_total_watts = eq.quantity * eq.power_rating_watts
            base_equipment_watts += eq_total_watts
            equipment_breakdown.append({
                "name": eq.equipment_name,
                "quantity": eq.quantity,
                "rating_watts": eq.power_rating_watts,
                "total_watts": eq_total_watts
            })

        # Sensible metabolic heat dissipated by occupants (~85W per person) increases HVAC compressor load
        occupant_cooling_load_watts = current_people * 85.0 if current_people > 0 else 0.0

        # When room is completely empty, assume baseline standby power (20% of equipment e.g. routers/standby)
        is_occupied = current_people > 0
        effective_power_watts = (base_equipment_watts + occupant_cooling_load_watts) if is_occupied else (base_equipment_watts * 0.15)

        return {
            "room_id": room.id,
            "room_name": f"{room.building} - {room.room_number}",
            "people_count": current_people,
            "base_equipment_watts": round(base_equipment_watts, 1),
            "occupant_thermal_load_watts": round(occupant_cooling_load_watts, 1),
            "effective_power_watts": round(effective_power_watts, 1),
            "effective_power_kw": round(effective_power_watts / 1000.0, 3),
            "is_occupied": is_occupied,
            "equipment_breakdown": equipment_breakdown
        }

    @staticmethod
    def estimate_energy_kwh(power_kw: float, duration_hours: float) -> float:
        """
        Calculates Energy (kWh) = Total Power (kW) * Operating Time (Hours).
        """
        return round(power_kw * duration_hours, 3)

    @staticmethod
    def generate_energy_recommendations(
        room: Room,
        current_people: int,
        effective_power_kw: float
    ) -> List[Dict[str, Any]]:
        """Generates clear, actionable energy optimization suggestions based on live data."""
        tips = []

        if current_people == 0 and effective_power_kw > 1.5:
            tips.append({
                "type": "phantom_load",
                "severity": "high",
                "title": "Turn Off Air Conditioning & Lights in Empty Room",
                "message": f"{room.building} - {room.room_number} is vacant but drawing {effective_power_kw:.2f} kW. Powering down AC and lighting could save ~{effective_power_kw * 4:.1f} kWh over 4 hours.",
                "potential_savings_kwh": round(effective_power_kw * 4, 1)
            })

        occ_pct = (current_people / room.capacity * 100.0) if room.capacity > 0 else 0.0
        if 0 < occ_pct < 25.0 and effective_power_kw > 2.5:
            tips.append({
                "type": "underutilization_waste",
                "severity": "medium",
                "title": "Low Occupancy Thermal Inefficiency",
                "message": f"Only {current_people} occupants ({int(occ_pct)}% capacity) in {room.building} - {room.room_number}. Consider consolidating into a smaller seminar room to reduce AC cooling volume.",
                "potential_savings_kwh": round(effective_power_kw * 0.4 * 3, 1)
            })

        if current_people > 0 and occ_pct > 80.0:
            tips.append({
                "type": "optimal_efficiency",
                "severity": "info",
                "title": "High Energy Utilization Efficiency",
                "message": f"{room.building} - {room.room_number} is operating at high space-to-energy efficiency ({int(occ_pct)}% capacity).",
                "potential_savings_kwh": 0.0
            })

        return tips
