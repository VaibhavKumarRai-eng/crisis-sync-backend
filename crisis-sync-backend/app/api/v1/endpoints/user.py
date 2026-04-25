from fastapi import APIRouter, Depends, Query

from app.core.dependencies import require_roles
from app.core.enums import UserRole
from app.schemas.user_schema import UserResponse
from app.services.user_service import UserService

router = APIRouter()


@router.get("/", response_model=list[UserResponse])
async def list_users(
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0),
    _: dict = Depends(require_roles(UserRole.ADMIN)),
) -> list[dict]:
    return await UserService().list_users(limit=limit, skip=skip)
