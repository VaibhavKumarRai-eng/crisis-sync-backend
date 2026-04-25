from collections.abc import Callable

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer

from app.core.config import settings
from app.core.enums import UserRole
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import decode_access_token
from app.services.user_service import UserService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_PREFIX}/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload = decode_access_token(token)
    except ValueError as exc:
        raise UnauthorizedException("Invalid or expired token") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedException("Invalid token subject")

    user = await UserService().get_by_id(user_id)
    if not user:
        raise UnauthorizedException("User no longer exists")
    return user


def require_roles(*roles: UserRole) -> Callable:
    allowed_roles = {role.value for role in roles}

    async def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user.get("role") not in allowed_roles:
            raise ForbiddenException()
        return current_user

    return role_checker
