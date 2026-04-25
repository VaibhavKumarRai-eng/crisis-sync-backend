from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings
from app.db.collections import ALERTS_COLLECTION, SOS_COLLECTION, USERS_COLLECTION, VENUES_COLLECTION
from app.utils.logger import logger

client: AsyncIOMotorClient | None = None
database_override = None


async def connect_to_mongo() -> None:
    global client
    if database_override is not None:
        return
    if client is not None:
        return
    client = AsyncIOMotorClient(
        settings.MONGODB_URL,
        maxPoolSize=settings.MONGODB_MAX_POOL_SIZE,
        minPoolSize=settings.MONGODB_MIN_POOL_SIZE,
        serverSelectionTimeoutMS=settings.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    )
    await client.admin.command("ping")
    await create_indexes()
    logger.info("MongoDB connection established")


async def close_mongo_connection() -> None:
    global client
    if client:
        client.close()
        client = None


def get_database():
    if database_override is not None:
        return database_override
    if client is None:
        raise RuntimeError("MongoDB client is not initialized")
    return client[settings.MONGODB_DB_NAME]


def set_database_override(database) -> None:
    global database_override
    database_override = database


def clear_database_override() -> None:
    global database_override
    database_override = None


async def create_indexes() -> None:
    database = get_database()
    await database[USERS_COLLECTION].create_index("email", unique=True)
    await database[SOS_COLLECTION].create_index([("status", 1), ("created_at", -1)])
    await database[SOS_COLLECTION].create_index([("venue_id", 1), ("status", 1), ("priority", 1), ("created_at", -1)])
    await database[SOS_COLLECTION].create_index([("location", "2dsphere")])
    await database[ALERTS_COLLECTION].create_index([("venue_id", 1), ("created_at", -1)])
    await database[ALERTS_COLLECTION].create_index("created_at")
    await database[VENUES_COLLECTION].create_index("venue_id", unique=True)
