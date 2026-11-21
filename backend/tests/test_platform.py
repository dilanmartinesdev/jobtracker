import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import Settings


def test_liveness(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_readiness_checks_the_database(client: TestClient) -> None:
    assert client.get("/api/health/ready").json() == {"status": "ready"}


def test_readiness_fails_when_database_is_down(client: TestClient, db: Session) -> None:
    from app.database import get_db
    from app.main import create_app

    class Broken:
        def execute(self, *_: object) -> None:
            from sqlalchemy.exc import OperationalError

            raise OperationalError("SELECT 1", {}, Exception("down"))

    app = create_app()
    app.dependency_overrides[get_db] = lambda: Broken()
    response = TestClient(app).get("/api/health/ready")
    assert response.status_code == 503
    assert "down" not in response.text


def test_openapi_docs_are_served(client: TestClient) -> None:
    assert client.get("/api/docs").status_code == 200
    schema = client.get("/api/openapi.json").json()
    assert "/api/applications/{application_id}/history" in schema["paths"]


def test_cors_allows_only_configured_origins(client: TestClient) -> None:
    ask = {
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
    }
    allowed = client.options(
        "/api/applications", headers={"Origin": "http://localhost:5173", **ask}
    )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    denied = client.options("/api/applications", headers={"Origin": "http://evil.example", **ask})
    assert "access-control-allow-origin" not in denied.headers
    assert "access-control-allow-credentials" not in allowed.headers


def test_production_refuses_to_start_without_a_strong_secret() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production", secret_key="short")  # type: ignore[arg-type]


def test_missing_secret_in_development_gets_a_random_one() -> None:
    first = Settings(environment="development", secret_key="")  # type: ignore[arg-type]
    second = Settings(environment="development", secret_key="")  # type: ignore[arg-type]
    assert len(first.secret_key.get_secret_value()) >= 32
    assert first.secret_key.get_secret_value() != second.secret_key.get_secret_value()


def test_secret_never_appears_in_repr() -> None:
    settings = Settings(environment="test", secret_key="x" * 40)  # type: ignore[arg-type]
    assert "x" * 40 not in repr(settings)


def test_cors_origins_accept_a_comma_separated_string() -> None:
    settings = Settings(environment="test", cors_origins="http://a.com, http://b.com")  # type: ignore[arg-type]
    assert settings.cors_origins == ["http://a.com", "http://b.com"]


def test_demo_data_is_internally_consistent() -> None:
    """The seed script writes status and history by hand, so check they agree."""
    import itertools

    from scripts.seed import SAMPLE, build_application

    for company, position, location, days_ago, path, notes in SAMPLE:
        application = build_application(1, company, position, location, days_ago, path, notes)
        events = application.events
        assert events[0].from_status is None
        assert events[-1].to_status == application.status
        for earlier, later in itertools.pairwise(events):
            assert later.from_status == earlier.to_status
            assert later.created_at > earlier.created_at
