"""Runtime configuration, read from environment variables (and a local .env file)."""

import logging
import secrets
from functools import lru_cache
from typing import Annotated, Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger(__name__)

MIN_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./jobtracker.db"
    secret_key: SecretStr = SecretStr("")
    access_token_minutes: int = Field(default=60, gt=0)
    # NoDecode lets us accept a plain comma-separated string instead of a JSON list.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    rate_limit_enabled: bool = True
    auth_rate_limit: str = "10/minute"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @model_validator(mode="after")
    def _ensure_secret_key(self) -> Self:
        if len(self.secret_key.get_secret_value()) >= MIN_SECRET_LENGTH:
            return self
        if self.environment == "production":
            raise ValueError(
                f"SECRET_KEY must be set to at least {MIN_SECRET_LENGTH} characters in production"
            )
        # A random key is safe by default; the cost is that tokens die on restart.
        logger.warning("SECRET_KEY is not set; using a random key for this process only")
        self.secret_key = SecretStr(secrets.token_urlsafe(48))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
