from pydantic import BaseModel

from app.schemas.sos_schema import SOSResponse


class DashboardSummary(BaseModel):
    venue_id: str | None = None
    open_incidents: int
    acknowledged_incidents: int
    dispatched_incidents: int
    high_priority_incidents: int
    total_active_incidents: int
    recent_incidents: list[SOSResponse]
