from fastapi import APIRouter, Depends, Query

from app.core.dependencies import require_roles
from app.core.enums import UserRole
from app.schemas.venue_schema import VenueCreate, VenueResponse
from app.services.venue_service import VenueService

router = APIRouter()


@router.post("/", response_model=VenueResponse, status_code=201)
async def create_venue(
    payload: VenueCreate,
    _: dict = Depends(require_roles(UserRole.ADMIN)),
) -> dict:
    return await VenueService().create(payload.model_dump())


@router.get("/", response_model=list[VenueResponse])
async def list_venues(
    limit: int = Query(default=100, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    _: dict = Depends(require_roles(UserRole.ADMIN)),
) -> list[dict]:
    return await VenueService().list(limit=limit, skip=skip)
