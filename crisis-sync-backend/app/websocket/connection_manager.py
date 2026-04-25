import asyncio
import json

from fastapi import WebSocket

from app.core.config import settings
from app.utils.logger import logger


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        if len(self.active_connections) >= settings.MAX_WEBSOCKET_CONNECTIONS:
            await websocket.close(code=1013, reason="Server is at connection capacity")
            return
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)

    async def broadcast(self, message: str) -> None:
        connections = list(self.active_connections)
        results = await asyncio.gather(
            *(connection.send_text(message) for connection in connections),
            return_exceptions=True,
        )
        for connection, result in zip(connections, results, strict=False):
            if isinstance(result, Exception):
                logger.warning("Dropping failed WebSocket connection")
                self.disconnect(connection)

    async def broadcast_json(self, payload: dict) -> None:
        await self.broadcast(json.dumps(payload, default=str))


connection_manager = ConnectionManager()
