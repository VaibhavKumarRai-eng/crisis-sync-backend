from fastapi import APIRouter, Depends

from app.core.dependencies import require_roles
from app.core.enums import UserRole
from app.schemas.dashboard_schema import DashboardSummary
from app.services.dashboard_service import DashboardService

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    venue_id: str | None = None,
    _: dict = Depends(require_roles(UserRole.STAFF, UserRole.ADMIN)),
) -> dict:
    return await DashboardService().summary(venue_id=venue_id)
