from datetime import datetime

from pydantic import BaseModel, Field

from app.core.enums import AlertSeverity


class AlertCreate(BaseModel):
    venue_id: str = Field(default="default", min_length=1, max_length=80)
    title: str = Field(min_length=3, max_length=120)
    message: str = Field(min_length=3, max_length=1000)
    severity: AlertSeverity = AlertSeverity.MEDIUM
    location: str | None = None


class AlertResponse(BaseModel):
    id: str
    venue_id: str
    title: str
    message: str
    severity: AlertSeverity
    location: str | None = None
    created_by: str
    created_at: datetime
