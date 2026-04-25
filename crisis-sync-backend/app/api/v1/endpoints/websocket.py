from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket.connection_manager import connection_manager

router = APIRouter()


@router.websocket("/alerts")
async def alerts_websocket(websocket: WebSocket):
    await connection_manager.connect(websocket)
    try:
        await websocket.send_json({"type": "connection.ready", "message": "Subscribed to CrisisSync alerts"})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
