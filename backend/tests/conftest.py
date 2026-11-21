import os

# Must be set before the app is imported: settings are read once, at import time.
os.environ.update(
    ENVIRONMENT="test",
    SECRET_KEY="test-secret-key-that-is-long-enough-0123456789",
    DATABASE_URL="sqlite://",
    RATE_LIMIT_ENABLED="false",
)

from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import create_app

PASSWORD = "supersecreta1"
AuthHeaders = dict[str, str]

# Tests run on in-memory SQLite by default. Set TEST_DATABASE_URL to run the same suite on
# PostgreSQL, which is what CI does.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "sqlite://")


@pytest.fixture
def session_factory() -> Iterator[sessionmaker[Session]]:
    if TEST_DATABASE_URL.startswith("sqlite"):
        # StaticPool: every connection shares one in-memory SQLite database.
        engine = create_engine(
            TEST_DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
    else:
        engine = create_engine(TEST_DATABASE_URL)
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, autoflush=False)
    if not TEST_DATABASE_URL.startswith("sqlite"):
        Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    with session_factory() as session:
        yield session


@pytest.fixture
def client(session_factory: sessionmaker[Session]) -> Iterator[TestClient]:
    app = create_app()

    def override_get_db() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def login(client: TestClient) -> Callable[..., AuthHeaders]:
    def _login(email: str = "dylan@example.com", password: str = PASSWORD) -> AuthHeaders:
        client.post("/api/auth/register", json={"email": email, "password": password})
        response = client.post("/api/auth/login", data={"username": email, "password": password})
        return {"Authorization": f"Bearer {response.json()['access_token']}"}

    return _login


@pytest.fixture
def auth(login: Callable[..., AuthHeaders]) -> AuthHeaders:
    return login()
