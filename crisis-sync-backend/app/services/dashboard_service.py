import asyncio

from app.core.enums import CrisisSeverity, SOSStatus
from app.db.collections import SOS_COLLECTION
from app.db.database import get_database
from app.services.sos_service import serialize_sos


class DashboardService:
    def __init__(self) -> None:
        self.sos_collection = get_database()[SOS_COLLECTION]

    async def summary(self, venue_id: str | None = None) -> dict:
        base_query = {"venue_id": venue_id} if venue_id else {}
        active_statuses = [SOSStatus.OPEN.value, SOSStatus.ACKNOWLEDGED.value, SOSStatus.DISPATCHED.value]

        (
            open_count,
            acknowledged_count,
            dispatched_count,
            high_priority_count,
            total_active,
        ) = await asyncio.gather(
            self.sos_collection.count_documents({**base_query, "status": SOSStatus.OPEN.value}),
            self.sos_collection.count_documents({**base_query, "status": SOSStatus.ACKNOWLEDGED.value}),
            self.sos_collection.count_documents({**base_query, "status": SOSStatus.DISPATCHED.value}),
            self.sos_collection.count_documents(
                {**base_query, "priority": CrisisSeverity.HIGH.value, "status": {"$in": active_statuses}}
            ),
            self.sos_collection.count_documents({**base_query, "status": {"$in": active_statuses}}),
        )
        cursor = (
            self.sos_collection.find({**base_query, "status": {"$in": active_statuses}})
            .sort("created_at", -1)
            .limit(10)
        )

        return {
            "venue_id": venue_id,
            "open_incidents": open_count,
            "acknowledged_incidents": acknowledged_count,
            "dispatched_incidents": dispatched_count,
            "high_priority_incidents": high_priority_count,
            "total_active_incidents": total_active,
            "recent_incidents": [serialize_sos(incident) async for incident in cursor],
        }
