import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.models import Room, Equipment, EnergyReading

logger = logging.getLogger(__name__)


class EnergyIntelligenceService:
    """
    Thermodynamic and electrical calculation service separating:
    1. Rated connected equipment load (nameplate capacity).
    2. Estimated active electrical demand (accounting for realistic equipment duty cycles).
    3. Incremental HVAC electrical load: human sensible metabolic heat (85W/person)
       removed via institutional AC heat pumps operating at Coefficient of Performance (COP = 3.0).
       (Human metabolic heat is NOT treated as direct electricity!).
    4. Estimated electricity consumption (kWh = active kW * hours).
    5. Actual meter readings (exclusively from verified physical utility sub-meters).
    """

    # Documented institutional equipment duty cycles
    DUTY_CYCLES_OCCUPIED = {
        "led": 1.0,         # Continuous lighting during classes
        "light": 1.0,
        "panel": 1.0,
        "fan": 0.80,        # Cyclic ceiling fans
        "ac": 0.65,         # Thermostatic compressor cycling
        "air": 0.65,
        "chiller": 0.70,
        "pc": 0.70,         # Workstation compute vs idle
        "workstation": 0.70,
        "projector": 0.90,
        "default": 0.60
    }

    DUTY_CYCLES_STANDBY = {
        "led": 0.0,         # Lights off when vacant
        "light": 0.0,
        "fan": 0.0,
        "ac": 0.05,         # Idle standby electronics
        "air": 0.05,
        "chiller": 0.05,
        "pc": 0.15,         # Sleep mode / wake-on-LAN
        "workstation": 0.15,
        "projector": 0.02,
        "default": 0.05
    }

    # Institutional HVAC Coefficient of Performance (COP)
    # Typical EER 10-11 split/chiller AC corresponds to COP ~ 3.0
    AC_COP = 3.0

    # Human sensible heat dissipation per seated occupant (ASHRAE Standard 55)
    OCCUPANT_SENSIBLE_HEAT_WATTS = 85.0

    @classmethod
    def _match_duty_cycle(cls, equipment_name: str, is_occupied: bool) -> float:
        name_lower = equipment_name.lower()
        cycles = cls.DUTY_CYCLES_OCCUPIED if is_occupied else cls.DUTY_CYCLES_STANDBY
        for key, cycle in cycles.items():
            if key in name_lower:
                return cycle
        return cycles.get("default", 0.50 if is_occupied else 0.05)

    @classmethod
    def calculate_room_power_watts(cls, room: Room, current_people: int) -> Dict[str, Any]:
        """
        Calculates rated nameplate load, duty-cycle adjusted active load,
        and occupant-induced HVAC compressor load (85W / COP).
        """
        if current_people < 0:
            current_people = 0

        is_occupied = (current_people > 0)
        rated_equipment_watts = 0.0
        active_equipment_watts = 0.0
        has_active_ac = False
        equipment_breakdown = []

        equipment_list = getattr(room, "equipment_items", []) or []

        for eq in equipment_list:
            if not getattr(eq, "is_active", True):
                continue

            eq_total_rated = float(eq.quantity) * float(eq.power_rating_watts)
            duty_cycle = cls._match_duty_cycle(eq.equipment_name, is_occupied)
            eq_active_watts = eq_total_rated * duty_cycle

            if "ac" in eq.equipment_name.lower() or "air" in eq.equipment_name.lower() or "chiller" in eq.equipment_name.lower():
                has_active_ac = True

            rated_equipment_watts += eq_total_rated
            active_equipment_watts += eq_active_watts

            equipment_breakdown.append({
                "name": eq.equipment_name,
                "quantity": eq.quantity,
                "rating_watts": eq.power_rating_watts,
                "total_rated_watts": round(eq_total_rated, 1),
                "duty_cycle": round(duty_cycle, 2),
                "active_watts": round(eq_active_watts, 1)
            })

        # Physics-based Occupant HVAC Cooling Load:
        # Occupants produce sensible metabolic thermal heat (~85W/person).
        # Electrical power required by HVAC compressor to remove that heat:
        # P_elec = (N * 85W) / COP. Applies ONLY if an active AC is present in the room!
        if is_occupied and has_active_ac:
            thermal_dissipated_watts = current_people * cls.OCCUPANT_SENSIBLE_HEAT_WATTS
            occupant_hvac_electrical_watts = thermal_dissipated_watts / cls.AC_COP
        else:
            thermal_dissipated_watts = 0.0
            occupant_hvac_electrical_watts = 0.0

        effective_power_watts = active_equipment_watts + occupant_hvac_electrical_watts
        effective_power_kw = effective_power_watts / 1000.0

        return {
            "room_id": getattr(room, "id", None),
            "room_name": f"{getattr(room, 'building', 'Campus')} - {getattr(room, 'room_number', 'Room')}",
            "people_count": current_people,
            "is_occupied": is_occupied,
            "rated_connected_kw": round(rated_equipment_watts / 1000.0, 3),
            "active_equipment_watts": round(active_equipment_watts, 1),
            "occupant_thermal_heat_watts": round(thermal_dissipated_watts, 1),
            "occupant_induced_hvac_electrical_watts": round(occupant_hvac_electrical_watts, 1),
            "hvac_assumptions": {
                "sensible_heat_per_person_watts": cls.OCCUPANT_SENSIBLE_HEAT_WATTS,
                "ac_cop": cls.AC_COP,
                "ac_active_in_room": has_active_ac
            },
            "effective_power_watts": round(effective_power_watts, 1),
            "effective_power_kw": round(effective_power_kw, 3),
            "is_estimate": True,
            "data_label": "Modeled Engineering Estimate (Not Direct Meter Reading)",
            "equipment_breakdown": equipment_breakdown
        }

    @staticmethod
    def estimate_energy_kwh(power_kw: float, duration_hours: float) -> float:
        """
        Calculates Estimated Energy (kWh) = Total Power (kW) * Operating Time (Hours).
        Rejects invalid negative inputs.
        """
        if power_kw < 0.0:
            raise ValueError(f"Power (kW) cannot be negative: {power_kw}")
        if duration_hours < 0.0:
            raise ValueError(f"Operating duration (hours) cannot be negative: {duration_hours}")

        return round(float(power_kw) * float(duration_hours), 3)

    @staticmethod
    def generate_energy_recommendations(
        room: Room,
        current_people: int,
        effective_power_kw: float
    ) -> List[Dict[str, Any]]:
        """Generates actionable energy optimization suggestions derived from live physics metrics."""
        tips = []

        if current_people == 0 and effective_power_kw > 1.2:
            tips.append({
                "type": "phantom_load",
                "severity": "high",
                "title": "Turn Off Air Conditioning & Lighting in Vacant Classroom",
                "message": f"{room.building} - {room.room_number} is vacant (0 people) but drawing {effective_power_kw:.2f} kW. Powering down idle systems saves ~{effective_power_kw * 4:.1f} kWh over a 4-hour window.",
                "potential_savings_kwh": round(effective_power_kw * 4, 1)
            })

        occ_pct = (current_people / room.capacity * 100.0) if room.capacity > 0 else 0.0
        if 0 < occ_pct < 25.0 and effective_power_kw > 2.0:
            tips.append({
                "type": "underutilization_waste",
                "severity": "medium",
                "title": "Low Occupancy Thermal Volume Inefficiency",
                "message": f"Only {current_people} occupants ({int(occ_pct)}% capacity) in {room.building} - {room.room_number}. Consider consolidating into a smaller seminar room to reduce AC cooling volume.",
                "potential_savings_kwh": round(effective_power_kw * 0.35 * 3, 1)
            })

        if current_people > 0 and occ_pct > 80.0:
            tips.append({
                "type": "optimal_efficiency",
                "severity": "info",
                "title": "Optimal Space & Energy Efficiency",
                "message": f"{room.building} - {room.room_number} is operating at high space-to-energy efficiency ({int(occ_pct)}% capacity).",
                "potential_savings_kwh": 0.0
            })

        return tips
