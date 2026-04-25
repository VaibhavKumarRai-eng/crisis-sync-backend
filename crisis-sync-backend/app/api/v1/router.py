from fastapi import APIRouter

from app.api.v1.endpoints import alert, auth, dashboard, sos, user, venue, websocket

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(user.router, prefix="/users", tags=["users"])
api_router.include_router(venue.router, prefix="/venues", tags=["venues"])
api_router.include_router(sos.router, prefix="/sos", tags=["sos"])
api_router.include_router(alert.router, prefix="/alerts", tags=["alerts"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(websocket.router, prefix="/ws", tags=["websocket"])
