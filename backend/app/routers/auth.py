from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm

from app.config import get_settings
from app.dependencies import CurrentUser, DbSession
from app.models import User
from app.ratelimit import limiter
from app.schemas import ErrorResponse, Token, UserCreate, UserOut
from app.security import create_access_token
from app.services import users

router = APIRouter(prefix="/auth", tags=["auth"])

AUTH_RATE_LIMIT = get_settings().auth_rate_limit


@router.post(
    "/register",
    response_model=UserOut,
    status_code=HTTPStatus.CREATED,
    summary="Create an account",
    responses={409: {"model": ErrorResponse}, 429: {"model": ErrorResponse}},
)
@limiter.limit(AUTH_RATE_LIMIT)
def register(request: Request, data: UserCreate, db: DbSession) -> User:
    return users.create_user(db, data.email, data.password)


@router.post(
    "/login",
    response_model=Token,
    summary="Sign in and get an access token",
    description="Form-encoded (`username` is the email), as required by the OAuth2 password flow.",
    responses={401: {"model": ErrorResponse}, 429: {"model": ErrorResponse}},
)
@limiter.limit(AUTH_RATE_LIMIT)
def login(
    request: Request,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSession,
) -> Token:
    user = users.authenticate(db, form.username, form.password)
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user.id))


@router.get(
    "/me",
    response_model=UserOut,
    summary="Current user",
    responses={401: {"model": ErrorResponse}},
)
def read_me(user: CurrentUser) -> User:
    return user


@router.delete(
    "/me",
    status_code=HTTPStatus.NO_CONTENT,
    summary="Delete the account and all its data",
    responses={401: {"model": ErrorResponse}},
)
def delete_me(user: CurrentUser, db: DbSession) -> None:
    users.delete_user(db, user)
