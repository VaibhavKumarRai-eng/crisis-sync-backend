from datetime import datetime, timezone

from fastapi import BackgroundTasks

from app.db.collections import ALERTS_COLLECTION
from app.db.database import get_database
from app.services.notification_service import NotificationService
from app.utils.serializers import serialize_document
from app.websocket.connection_manager import connection_manager


def serialize_alert(alert: dict | None) -> dict | None:
    return serialize_document(alert)


class AlertService:
    def __init__(self) -> None:
        self.collection = get_database()[ALERTS_COLLECTION]
        self.notification_service = NotificationService()

    async def create(self, alert_data: dict, created_by: str, background_tasks: BackgroundTasks | None = None) -> dict:
        document = {
            **alert_data,
            "venue_id": alert_data.get("venue_id", "default"),
            "severity": getattr(alert_data["severity"], "value", alert_data["severity"]),
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc),
        }
        result = await self.collection.insert_one(document)
        document["_id"] = result.inserted_id
        serialized = serialize_alert(document)
        if background_tasks:
            background_tasks.add_task(self.notification_service.notify_staff, serialized)
        else:
            await self.notification_service.notify_staff(serialized)
        await connection_manager.broadcast_json({"type": "alert.created", "data": serialized})
        return serialized

    async def list(self, venue_id: str | None = None, limit: int = 50, skip: int = 0) -> list[dict]:
        query = {"venue_id": venue_id} if venue_id else {}
        cursor = self.collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
        return [serialize_alert(alert) async for alert in cursor]
