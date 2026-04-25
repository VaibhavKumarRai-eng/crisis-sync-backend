from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.core.dependencies import get_current_user, require_roles
from app.core.enums import CrisisSeverity, SOSStatus, UserRole
from app.schemas.sos_schema import SOSCreate, SOSResponse, SOSUpdate, TimelineEventCreate
from app.services.sos_service import SOSService

router = APIRouter()


@router.post("/", response_model=SOSResponse, status_code=201)
async def create_sos(
    payload: SOSCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
) -> dict:
    return await SOSService().create(payload.model_dump(), current_user, background_tasks)


@router.get("/", response_model=list[SOSResponse])
async def list_sos(
    status: SOSStatus | None = None,
    venue_id: str | None = None,
    priority: CrisisSeverity | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    _: dict = Depends(require_roles(UserRole.STAFF, UserRole.ADMIN)),
) -> list[dict]:
    priority_value = priority.value if priority else None
    return await SOSService().list(status=status, venue_id=venue_id, priority=priority_value, limit=limit, skip=skip)


@router.patch("/{sos_id}", response_model=SOSResponse)
async def update_sos(
    sos_id: str,
    payload: SOSUpdate,
    current_user: dict = Depends(require_roles(UserRole.STAFF, UserRole.ADMIN)),
) -> dict:
    return await SOSService().update_status(sos_id, payload.model_dump(exclude_none=True), actor_id=current_user["id"])


@router.post("/{sos_id}/timeline", response_model=SOSResponse)
async def add_timeline_event(
    sos_id: str,
    payload: TimelineEventCreate,
    current_user: dict = Depends(require_roles(UserRole.STAFF, UserRole.ADMIN)),
) -> dict:
    return await SOSService().add_timeline_event(sos_id, payload.model_dump(), actor_id=current_user["id"])
