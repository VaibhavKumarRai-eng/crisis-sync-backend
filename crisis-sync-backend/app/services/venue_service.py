from datetime import datetime, timezone

from pymongo.errors import DuplicateKeyError

from app.core.exceptions import ConflictException
from app.db.collections import VENUES_COLLECTION
from app.db.database import get_database
from app.utils.serializers import serialize_document


def serialize_venue(venue: dict | None) -> dict | None:
    return serialize_document(venue)


class VenueService:
    def __init__(self) -> None:
        self.collection = get_database()[VENUES_COLLECTION]

    async def create(self, data: dict) -> dict:
        document = {**data, "created_at": datetime.now(timezone.utc)}
        try:
            result = await self.collection.insert_one(document)
        except DuplicateKeyError as exc:
            raise ConflictException("A venue with this venue_id already exists") from exc
        document["_id"] = result.inserted_id
        return serialize_venue(document)

    async def list(self, limit: int = 100, skip: int = 0) -> list[dict]:
        cursor = self.collection.find({}).sort("name", 1).skip(skip).limit(limit)
        return [serialize_venue(venue) async for venue in cursor]
