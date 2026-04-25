from datetime import datetime

from pydantic import BaseModel, Field


class VenueCreate(BaseModel):
    venue_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=2, max_length=120)
    address: str | None = Field(default=None, max_length=500)


class VenueResponse(BaseModel):
    id: str
    venue_id: str
    name: str
    address: str | None = None
    created_at: datetime
