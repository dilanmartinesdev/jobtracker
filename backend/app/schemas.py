"""Pydantic schemas: what the API accepts and what it returns.

Input schemas validate and normalise. Output schemas stay plain so that reading data
that is already stored can never fail validation.
"""

from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import (
    AfterValidator,
    AnyHttpUrl,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    TypeAdapter,
    field_validator,
)

from app.models import Status, today_utc

_http_url = TypeAdapter(AnyHttpUrl)


def _blank_to_none(value: object) -> object:
    """Forms send "" for empty fields; store them as NULL."""
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _normalize_http_url(value: str) -> str:
    """Accept only http(s) links. Rejects javascript:, data:, ftp: and friends, which would
    be a stored-XSS risk once the frontend renders the value as a link."""
    return str(_http_url.validate_python(value))


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
HttpUrlStr = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=500),
    AfterValidator(_normalize_http_url),
]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class ErrorResponse(BaseModel):
    detail: str


class UserCreate(BaseModel):
    email: EmailStr
    password: Password


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105


class ApplicationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company: Name
    position: Name
    status: Status = Status.APPLIED
    location: Annotated[ShortText | None, BeforeValidator(_blank_to_none)] = None
    url: Annotated[HttpUrlStr | None, BeforeValidator(_blank_to_none)] = None
    notes: Annotated[LongText | None, BeforeValidator(_blank_to_none)] = None
    applied_date: date = Field(default_factory=today_utc)


class ApplicationUpdate(BaseModel):
    """Partial update. Fields that are not sent stay untouched; optional fields can be
    cleared by sending null, required ones cannot."""

    model_config = ConfigDict(extra="forbid")

    company: Name | None = None
    position: Name | None = None
    status: Status | None = None
    location: Annotated[ShortText | None, BeforeValidator(_blank_to_none)] = None
    url: Annotated[HttpUrlStr | None, BeforeValidator(_blank_to_none)] = None
    notes: Annotated[LongText | None, BeforeValidator(_blank_to_none)] = None
    applied_date: date | None = None

    @field_validator("company", "position", "status", "applied_date")
    @classmethod
    def _required_fields_cannot_be_null(cls, value: object) -> object:
        # Only runs when the field is actually sent; omitted fields skip validation.
        if value is None:
            raise ValueError("This field cannot be null")
        return value


class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company: str
    position: str
    status: Status
    location: str | None
    url: str | None
    notes: str | None
    applied_date: date
    created_at: datetime
    updated_at: datetime


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    from_status: Status | None
    to_status: Status
    created_at: datetime


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int


class WeeklyCount(BaseModel):
    week_start: date
    count: int


class StatsOut(BaseModel):
    total: int
    by_status: dict[str, int]
    reached_interview: int
    reached_offer: int
    interview_rate: float
    offer_rate: float
    weekly: list[WeeklyCount]
