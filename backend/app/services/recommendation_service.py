import logging
from typing import List, Dict, Any
from app.models import Room, OccupancyReading, EnergyReading

logger = logging.getLogger(__name__)

class CampusRecommendationEngine:
    """Generates intelligent campus optimization advice derived strictly from database metrics."""

    @staticmethod
    def generate_campus_recommendations(
        rooms: List[Room],
        room_occupancies: Dict[int, OccupancyReading],
        room_powers_kw: Dict[int, float]
    ) -> List[Dict[str, Any]]:
        recommendations = []

        # Find underutilized rooms vs overcrowded rooms for reallocation matching
        underutilized = []
        overcrowded = []

        for room in rooms:
            occ = room_occupancies.get(room.id)
            people = occ.people_count if occ else 0
            power_kw = room_powers_kw.get(room.id, 0.5)
            occ_pct = (people / room.capacity * 100.0) if room.capacity > 0 else 0.0

            # 1. Overcrowding risk
            if occ_pct >= 90.0:
                overcrowded.append((room, people, occ_pct))
                recommendations.append({
                    "id": f"rec_cap_{room.id}",
                    "category": "Capacity & Safety",
                    "priority": "high",
                    "title": f"High Capacity Congestion in {room.room_number}",
                    "room_id": room.id,
                    "room_name": f"{room.building} - {room.room_number}",
                    "message": f"Room is at {int(occ_pct)}% capacity ({people}/{room.capacity} seats taken). Consider splitting lecture or assigning to a larger hall.",
                    "action": "Reallocate Hall"
                })

            # 2. Severe underutilization during active hours
            elif occ_pct < 20.0 and people > 0:
                underutilized.append((room, people, occ_pct))
                recommendations.append({
                    "id": f"rec_util_{room.id}",
                    "category": "Space Utilization",
                    "priority": "medium",
                    "title": f"Space Underutilization in {room.room_number}",
                    "room_id": room.id,
                    "room_name": f"{room.building} - {room.room_number}",
                    "message": f"Only {people} students present in a {room.capacity}-seat hall ({int(occ_pct)}% utilization). Reallocating to a seminar room could free up this hall.",
                    "action": "Consolidate Space"
                })

            # 3. Energy waste in empty rooms
            elif people == 0 and power_kw > 1.2:
                recommendations.append({
                    "id": f"rec_nrg_{room.id}",
                    "category": "Energy Optimization",
                    "priority": "high",
                    "title": f"Equipment Running in Vacant {room.room_number}",
                    "room_id": room.id,
                    "room_name": f"{room.building} - {room.room_number}",
                    "message": f"{room.building} - {room.room_number} is completely vacant but consuming ~{power_kw:.2f} kW. Automated shutoff could save {power_kw * 3:.1f} kWh.",
                    "action": "Power Down Equipment"
                })

        # 4. Cross-room reallocation matching
        if overcrowded and underutilized:
            crowded_room, crowded_count, _ = overcrowded[0]
            empty_room, empty_count, _ = underutilized[0]
            if empty_room.capacity >= crowded_count:
                recommendations.append({
                    "id": f"rec_swap_{crowded_room.id}_{empty_room.id}",
                    "category": "Smart Reallocation",
                    "priority": "medium",
                    "title": "Room Swap Opportunity",
                    "room_id": crowded_room.id,
                    "room_name": f"{crowded_room.room_number} ⇄ {empty_room.room_number}",
                    "message": f"Swap {crowded_room.room_number} ({crowded_count} occupants) with {empty_room.room_number} ({empty_count} occupants, capacity {empty_room.capacity}) to eliminate overcrowding.",
                    "action": "Execute Room Swap"
                })

        return recommendations
