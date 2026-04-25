from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.middleware import (
    InMemoryRateLimitMiddleware,
    RequestContextMiddleware,
    SecurityHeadersMiddleware,
    TokenAuthMiddleware,
)
from app.db.database import close_mongo_connection, connect_to_mongo
from app.schemas.health_schema import HealthResponse
from app.utils.logger import configure_logging, logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    logger.info("Starting CrisisSync API")
    await connect_to_mongo()
    yield
    await close_mongo_connection()
    logger.info("Stopped CrisisSync API")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Real-time emergency response backend for CrisisSync.",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.TRUSTED_HOSTS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(InMemoryRateLimitMiddleware)
app.add_middleware(TokenAuthMiddleware)
app.add_middleware(RequestContextMiddleware)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    request_id = getattr(request.state, "request_id", None)
    logger.warning(
        "Validation error on {path}: {errors}",
        path=request.url.path,
        errors=exc.errors(),
        request_id=request_id,
    )
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", None)
    log = logger.warning if exc.status_code < 500 else logger.error
    log(
        "HTTP error on {path}: {status_code} {detail}",
        path=request.url.path,
        status_code=exc.status_code,
        detail=exc.detail,
        request_id=request_id,
    )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail}, headers=getattr(exc, "headers", None))


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.exception("Unhandled application error on {path}", path=request.url.path, request_id=request_id)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/", response_model=HealthResponse)
async def root() -> dict:
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "version": settings.VERSION,
    }


@app.get("/health", response_model=HealthResponse)
async def health_check() -> dict:
    return {
        "status": "ok",
        "service": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "version": settings.VERSION,
    }
