from datetime import datetime, timezone

from bson import ObjectId
from fastapi import BackgroundTasks
from pymongo import ReturnDocument

from app.core.enums import SOSStatus, TimelineEventType
from app.core.exceptions import NotFoundException
from app.db.collections import SOS_COLLECTION
from app.db.database import get_database
from app.services.ai_service import AIIncidentService
from app.services.notification_service import NotificationService
from app.utils.serializers import serialize_document
from app.websocket.connection_manager import connection_manager


def serialize_sos(sos: dict | None) -> dict | None:
    return serialize_document(sos)


class SOSService:
    def __init__(self) -> None:
        self.collection = get_database()[SOS_COLLECTION]
        self.ai_service = AIIncidentService()
        self.notification_service = NotificationService()

    async def create(self, sos_data: dict, user: dict, background_tasks: BackgroundTasks | None = None) -> dict:
        now = datetime.now(timezone.utc)
        venue_id = sos_data.get("venue_id") or user.get("venue_id") or "default"
        emergency_type = getattr(sos_data["emergency_type"], "value", sos_data["emergency_type"])
        sos_data["emergency_type"] = emergency_type
        sos_data["venue_id"] = venue_id
        analysis = await self.ai_service.analyze_incident(sos_data)
        document = {
            **sos_data,
            "user_id": user["id"],
            "location": {
                "type": "Point",
                "coordinates": [sos_data["longitude"], sos_data["latitude"]],
            },
            "status": SOSStatus.OPEN.value,
            "priority": analysis["priority"],
            "ai_summary": analysis["summary"],
            "classification": analysis,
            "assigned_to": None,
            "timeline": [
                self._timeline_event(TimelineEventType.CREATED, "Emergency created", user["id"], now),
                self._timeline_event(
                    TimelineEventType.CLASSIFIED,
                    f"Auto-classified as {analysis['priority']}",
                    "system",
                    now,
                ),
            ],
            "created_at": now,
            "updated_at": now,
        }
        result = await self.collection.insert_one(document)
        document["_id"] = result.inserted_id
        serialized = serialize_sos(document)
        if background_tasks:
            background_tasks.add_task(self.notification_service.notify_staff, serialized)
        else:
            await self.notification_service.notify_staff(serialized)
        await connection_manager.broadcast_json({"type": "sos.created", "data": serialized})
        return serialized

    async def list(
        self,
        status: SOSStatus | None = None,
        venue_id: str | None = None,
        priority: str | None = None,
        limit: int = 50,
        skip: int = 0,
    ) -> list[dict]:
        query = {}
        if status:
            query["status"] = status.value
        if venue_id:
            query["venue_id"] = venue_id
        if priority:
            query["priority"] = priority
        cursor = self.collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
        return [serialize_sos(sos) async for sos in cursor]

    async def update_status(self, sos_id: str, update_data: dict, actor_id: str = "system") -> dict:
        if not ObjectId.is_valid(sos_id):
            raise NotFoundException("SOS request not found")

        now = datetime.now(timezone.utc)
        timeline_message = update_data.pop("note", None)
        if "status" in update_data:
            update_data["status"] = getattr(update_data["status"], "value", update_data["status"])
        update_data["updated_at"] = now
        event_type = self._event_type_for_status(update_data.get("status"))
        event = self._timeline_event(
            event_type,
            timeline_message or f"SOS updated to {update_data.get('status', 'updated')}",
            actor_id,
            now,
        )
        result = await self.collection.find_one_and_update(
            {"_id": ObjectId(sos_id)},
            {"$set": update_data, "$push": {"timeline": event}},
            return_document=ReturnDocument.AFTER,
        )
        if not result:
            raise NotFoundException("SOS request not found")
        serialized = serialize_sos(result)
        await connection_manager.broadcast_json({"type": "sos.updated", "data": serialized})
        return serialized

    async def add_timeline_event(self, sos_id: str, event_data: dict, actor_id: str) -> dict:
        if not ObjectId.is_valid(sos_id):
            raise NotFoundException("SOS request not found")
        now = datetime.now(timezone.utc)
        event = self._timeline_event(event_data["event_type"], event_data["message"], actor_id, now)
        result = await self.collection.find_one_and_update(
            {"_id": ObjectId(sos_id)},
            {"$set": {"updated_at": now}, "$push": {"timeline": event}},
            return_document=ReturnDocument.AFTER,
        )
        if not result:
            raise NotFoundException("SOS request not found")
        serialized = serialize_sos(result)
        await connection_manager.broadcast_json({"type": "sos.timeline", "data": serialized})
        return serialized

    def _timeline_event(
        self,
        event_type: TimelineEventType | str,
        message: str,
        actor_id: str,
        occurred_at: datetime,
    ) -> dict:
        # Timeline events are embedded to keep the incident lifecycle query cheap for dashboards.
        return {
            "event_type": getattr(event_type, "value", event_type),
            "message": message,
            "actor_id": actor_id,
            "occurred_at": occurred_at,
        }

    def _event_type_for_status(self, status: str | None) -> TimelineEventType:
        return {
            SOSStatus.ACKNOWLEDGED.value: TimelineEventType.ACKNOWLEDGED,
            SOSStatus.DISPATCHED.value: TimelineEventType.DISPATCHED,
            SOSStatus.RESOLVED.value: TimelineEventType.RESOLVED,
            SOSStatus.CANCELLED.value: TimelineEventType.CANCELLED,
        }.get(status or "", TimelineEventType.NOTE)
