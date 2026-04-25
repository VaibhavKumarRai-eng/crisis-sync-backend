from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user
from app.core.exceptions import UnauthorizedException
from app.core.security import create_access_token
from app.schemas.user_schema import Token, UserCreate, UserLogin, UserResponse
from app.services.user_service import UserService

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(payload: UserCreate) -> dict:
    return await UserService().create(payload.model_dump())


@router.post("/login", response_model=Token)
async def login(payload: UserLogin) -> dict:
    user = await UserService().authenticate(payload.email, payload.password)
    if not user:
        raise UnauthorizedException("Invalid email or password")

    access_token = create_access_token(
        subject=user["id"],
        additional_claims={"role": user["role"], "email": user["email"], "venue_id": user["venue_id"]},
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def read_me(current_user: dict = Depends(get_current_user)) -> dict:
    return current_user
