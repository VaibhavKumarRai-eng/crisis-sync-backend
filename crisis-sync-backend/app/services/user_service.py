from datetime import datetime, timezone

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.core.exceptions import ConflictException
from app.core.security import get_password_hash, verify_password
from app.db.collections import USERS_COLLECTION
from app.db.database import get_database
from app.utils.serializers import serialize_document


def serialize_user(user: dict | None) -> dict | None:
    return serialize_document(user, drop_fields={"hashed_password"})


class UserService:
    def __init__(self) -> None:
        self.collection = get_database()[USERS_COLLECTION]

    async def create(self, user_data: dict) -> dict:
        now = datetime.now(timezone.utc)
        document = {
            "name": user_data["name"],
            "email": user_data["email"].lower(),
            "hashed_password": get_password_hash(user_data["password"]),
            "phone": user_data.get("phone"),
            "venue_id": user_data.get("venue_id", "default"),
            "role": user_data.get("role", "guest"),
            "created_at": now,
            "updated_at": now,
        }
        try:
            result = await self.collection.insert_one(document)
        except DuplicateKeyError as exc:
            raise ConflictException("A user with this email already exists") from exc
        document["_id"] = result.inserted_id
        return serialize_user(document)

    async def authenticate(self, email: str, password: str) -> dict | None:
        user = await self.collection.find_one({"email": email.lower()})
        if not user or not verify_password(password, user["hashed_password"]):
            return None
        return serialize_user(user)

    async def get_by_id(self, user_id: str) -> dict | None:
        if not ObjectId.is_valid(user_id):
            return None
        user = await self.collection.find_one({"_id": ObjectId(user_id)})
        return serialize_user(user)

    async def list_users(self, limit: int = 50, skip: int = 0) -> list[dict]:
        cursor = self.collection.find({}).sort("created_at", -1).skip(skip).limit(limit)
        return [serialize_user(user) async for user in cursor]
