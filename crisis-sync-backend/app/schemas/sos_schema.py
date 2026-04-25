from datetime import datetime

from pydantic import BaseModel, Field

from app.core.enums import CrisisSeverity, EmergencyType, SOSStatus, TimelineEventType


class SOSCreate(BaseModel):
    venue_id: str = Field(default="default", min_length=1, max_length=80)
    emergency_type: EmergencyType = EmergencyType.OTHER
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    message: str | None = Field(default=None, max_length=1000)
    address: str | None = None


class SOSUpdate(BaseModel):
    status: SOSStatus
    assigned_to: str | None = None
    note: str | None = Field(default=None, max_length=1000)


class TimelineEventCreate(BaseModel):
    event_type: TimelineEventType = TimelineEventType.NOTE
    message: str = Field(min_length=1, max_length=1000)


class SOSResponse(BaseModel):
    id: str
    venue_id: str
    user_id: str
    emergency_type: EmergencyType
    latitude: float
    longitude: float
    location: dict
    message: str | None = None
    address: str | None = None
    status: SOSStatus
    priority: CrisisSeverity
    ai_summary: str | None = None
    assigned_to: str | None = None
    timeline: list[dict]
    created_at: datetime
    updated_at: datetime
