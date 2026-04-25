from fastapi import HTTPException, status


class AppException(HTTPException):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(status_code=status_code, detail=detail)


class BadRequestException(AppException):
    def __init__(self, detail: str = "Bad request") -> None:
        super().__init__(status.HTTP_400_BAD_REQUEST, detail)


class UnauthorizedException(AppException):
    def __init__(self, detail: str = "Authentication required") -> None:
        super().__init__(status.HTTP_401_UNAUTHORIZED, detail)


class ForbiddenException(AppException):
    def __init__(self, detail: str = "Insufficient permissions") -> None:
        super().__init__(status.HTTP_403_FORBIDDEN, detail)


class NotFoundException(AppException):
    def __init__(self, detail: str = "Resource not found") -> None:
        super().__init__(status.HTTP_404_NOT_FOUND, detail)


class ConflictException(AppException):
    def __init__(self, detail: str = "Resource already exists") -> None:
        super().__init__(status.HTTP_409_CONFLICT, detail)
