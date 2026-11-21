import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Application, User
from app.security import ALGORITHM, hash_password, needs_rehash
from tests.conftest import PASSWORD, AuthHeaders

REGISTER = "/api/auth/register"
LOGIN = "/api/auth/login"
ME = "/api/auth/me"


def _token(payload: dict[str, object], key: str | None = None) -> str:
    secret = key or get_settings().secret_key.get_secret_value()
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def test_register_normalizes_email_and_never_returns_the_hash(client: TestClient) -> None:
    response = client.post(REGISTER, json={"email": "A@Example.com", "password": PASSWORD})
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "a@example.com"
    assert "password" not in body
    assert "hashed_password" not in body


def test_login_and_me(client: TestClient) -> None:
    client.post(REGISTER, json={"email": "a@example.com", "password": PASSWORD})
    response = client.post(LOGIN, data={"username": "A@EXAMPLE.com", "password": PASSWORD})
    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    token = response.json()["access_token"]

    me = client.get(ME, headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "a@example.com"


def test_duplicate_email_is_rejected_case_insensitively(client: TestClient) -> None:
    assert (
        client.post(REGISTER, json={"email": "a@example.com", "password": PASSWORD}).status_code
        == 201
    )
    response = client.post(REGISTER, json={"email": "A@EXAMPLE.COM", "password": PASSWORD})
    assert response.status_code == 409


def test_password_length_limits(client: TestClient) -> None:
    short = client.post(REGISTER, json={"email": "a@example.com", "password": "1234567"})
    assert short.status_code == 422
    long = client.post(REGISTER, json={"email": "a@example.com", "password": "x" * 129})
    assert long.status_code == 422


def test_multibyte_password_does_not_crash(client: TestClient) -> None:
    # Regression: bcrypt rejected passwords over 72 bytes, so 40 emoji (160 bytes) caused a 500.
    password = "😀" * 40
    assert (
        client.post(REGISTER, json={"email": "e@example.com", "password": password}).status_code
        == 201
    )
    response = client.post(LOGIN, data={"username": "e@example.com", "password": password})
    assert response.status_code == 200


def test_wrong_password_and_unknown_user_look_identical(client: TestClient) -> None:
    client.post(REGISTER, json={"email": "a@example.com", "password": PASSWORD})
    wrong = client.post(LOGIN, data={"username": "a@example.com", "password": "incorrecta123"})
    unknown = client.post(
        LOGIN, data={"username": "nadie@example.com", "password": "incorrecta123"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_unknown_user_still_pays_the_hashing_cost(client: TestClient) -> None:
    # Regression: unknown emails used to return in ~7 ms against ~290 ms for real accounts,
    # which let an attacker list which emails are registered by timing the response.
    client.post(REGISTER, json={"email": "a@example.com", "password": PASSWORD})

    def average(email: str, runs: int = 3) -> float:
        start = time.perf_counter()
        for _ in range(runs):
            client.post(LOGIN, data={"username": email, "password": "incorrecta123"})
        return (time.perf_counter() - start) / runs

    known, unknown = average("a@example.com"), average("nadie@example.com")
    assert unknown > known * 0.4


def test_protected_routes_reject_missing_and_garbage_tokens(client: TestClient) -> None:
    assert client.get("/api/applications").status_code == 401
    assert client.get(ME, headers={"Authorization": "Bearer basura"}).status_code == 401


def test_expired_token_is_rejected(client: TestClient, auth: AuthHeaders) -> None:
    past = datetime.now(UTC) - timedelta(hours=1)
    expired = _token({"sub": "1", "exp": past})
    assert client.get(ME, headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_token_signed_with_another_key_is_rejected(client: TestClient, auth: AuthHeaders) -> None:
    # Regression: the old default secret was public in the repo, so tokens could be forged.
    future = datetime.now(UTC) + timedelta(hours=1)
    forged = _token(
        {"sub": "1", "exp": future}, key="a-different-key-of-sufficient-length-0123456789"
    )
    assert client.get(ME, headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_token_without_expiry_is_rejected(client: TestClient, auth: AuthHeaders) -> None:
    no_exp = _token({"sub": "1"})
    assert client.get(ME, headers={"Authorization": f"Bearer {no_exp}"}).status_code == 401


def test_token_of_a_deleted_user_is_rejected(client: TestClient, auth: AuthHeaders) -> None:
    assert client.delete(ME, headers=auth).status_code == 204
    assert client.get(ME, headers=auth).status_code == 401


def test_delete_account_removes_applications_and_history(
    client: TestClient, auth: AuthHeaders, db: Session
) -> None:
    client.post("/api/applications", json={"company": "Acme", "position": "Dev"}, headers=auth)
    assert db.scalar(select(Application)) is not None
    assert client.delete(ME, headers=auth).status_code == 204
    db.expire_all()
    assert db.scalar(select(User)) is None
    assert db.scalar(select(Application)) is None


def test_login_is_rate_limited(client: TestClient) -> None:
    from app.ratelimit import limiter

    limiter.enabled = True
    limiter.reset()
    try:
        codes = [
            client.post(
                LOGIN, data={"username": "a@example.com", "password": f"mala-{i}-xyz"}
            ).status_code
            for i in range(12)
        ]
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes[:10] == [401] * 10
    assert 429 in codes[10:]


def test_old_hashes_are_upgraded_on_login(client: TestClient, db: Session) -> None:
    from argon2 import PasswordHasher
    from argon2.profiles import RFC_9106_LOW_MEMORY

    weak = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash(PASSWORD)
    assert needs_rehash(weak)
    db.add(User(email="old@example.com", hashed_password=weak))
    db.commit()

    response = client.post(LOGIN, data={"username": "old@example.com", "password": PASSWORD})
    assert response.status_code == 200
    db.expire_all()
    stored = db.scalar(select(User).where(User.email == "old@example.com"))
    assert stored is not None
    assert stored.hashed_password != weak
    assert not needs_rehash(stored.hashed_password)
    assert RFC_9106_LOW_MEMORY is not None


def test_garbage_stored_hash_fails_closed(client: TestClient, db: Session) -> None:
    db.add(User(email="bad@example.com", hashed_password="not-a-hash"))
    db.commit()
    response = client.post(LOGIN, data={"username": "bad@example.com", "password": PASSWORD})
    assert response.status_code == 401


def test_hash_password_is_salted(login: Callable[..., AuthHeaders]) -> None:
    assert hash_password(PASSWORD) != hash_password(PASSWORD)
