from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.core.dependencies import require_roles
from app.core.enums import UserRole
from app.schemas.alert_schema import AlertCreate, AlertResponse
from app.services.alert_service import AlertService

router = APIRouter()


@router.post("/", response_model=AlertResponse, status_code=201)
async def create_alert(
    payload: AlertCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_roles(UserRole.STAFF, UserRole.ADMIN)),
) -> dict:
    return await AlertService().create(
        payload.model_dump(),
        created_by=current_user["id"],
        background_tasks=background_tasks,
    )


@router.get("/", response_model=list[AlertResponse])
async def list_alerts(
    venue_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    _: dict = Depends(require_roles(UserRole.GUEST, UserRole.STAFF, UserRole.ADMIN)),
) -> list[dict]:
    return await AlertService().list(venue_id=venue_id, limit=limit, skip=skip)
