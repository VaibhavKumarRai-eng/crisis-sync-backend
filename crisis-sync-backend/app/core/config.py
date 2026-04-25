from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "CrisisSync"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"
    API_V1_PREFIX: str = "/api/v1"
    BACKEND_CORS_ORIGINS: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    TRUSTED_HOSTS: list[str] = Field(default_factory=lambda: ["localhost", "127.0.0.1", "testserver", "*.localhost"])

    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "crisis_sync"
    MONGODB_MAX_POOL_SIZE: int = 100
    MONGODB_MIN_POOL_SIZE: int = 0
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: int = 5000

    SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    LOG_LEVEL: str = "INFO"
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_REQUESTS: int = 120
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_MAX_IDENTITIES: int = 10000
    MAX_WEBSOCKET_CONNECTIONS: int = 10000

    AI_PROVIDER: str = "rule_based"
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini-1.5-pro"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.is_production and self.SECRET_KEY in {"change-me", "change-me-in-production", "dev-only-change-me"}:
            raise ValueError("SECRET_KEY must be changed before running in production")
        if self.is_production and "*" in self.BACKEND_CORS_ORIGINS:
            raise ValueError("Wildcard CORS origins are not allowed in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
