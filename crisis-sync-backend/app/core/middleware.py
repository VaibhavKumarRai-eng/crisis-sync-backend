import time
import uuid
from collections import OrderedDict, deque
from collections.abc import Awaitable, Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.core.security import decode_access_token
from app.utils.logger import logger


class TokenAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request.state.auth = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header.removeprefix("Bearer ").strip()
            try:
                request.state.auth = decode_access_token(token)
            except ValueError:
                logger.warning("Invalid bearer token received")
        return await call_next(request)


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
        if settings.is_production:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


class InMemoryRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app) -> None:
        super().__init__(app)
        self.requests: OrderedDict[str, deque[float]] = OrderedDict()

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        if not settings.RATE_LIMIT_ENABLED or request.url.path in {"/", "/health"}:
            return await call_next(request)

        identifier = self._identifier(request)
        now = time.monotonic()
        window_start = now - settings.RATE_LIMIT_WINDOW_SECONDS
        bucket = self.requests.setdefault(identifier, deque())
        self.requests.move_to_end(identifier)

        while bucket and bucket[0] < window_start:
            bucket.popleft()

        if len(bucket) >= settings.RATE_LIMIT_REQUESTS:
            logger.warning("Rate limit exceeded for {identifier}", identifier=identifier)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests"},
                headers={"Retry-After": str(settings.RATE_LIMIT_WINDOW_SECONDS)},
            )

        bucket.append(now)
        self._evict_old_identities()
        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(settings.RATE_LIMIT_REQUESTS)
        response.headers["X-RateLimit-Remaining"] = str(max(settings.RATE_LIMIT_REQUESTS - len(bucket), 0))
        return response

    def _identifier(self, request: Request) -> str:
        auth = getattr(request.state, "auth", None)
        if auth and auth.get("sub"):
            return f"user:{auth['sub']}"
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return f"ip:{forwarded_for.split(',')[0].strip()}"
        return f"ip:{request.client.host if request.client else 'unknown'}"

    def _evict_old_identities(self) -> None:
        while len(self.requests) > settings.RATE_LIMIT_MAX_IDENTITIES:
            self.requests.popitem(last=False)
