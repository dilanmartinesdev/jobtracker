from collections.abc import Callable
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ApplicationEvent, Status, today_utc, utcnow
from tests.conftest import AuthHeaders

BASE = "/api/applications"
JOB = {"company": "FEMSA", "position": "Junior Backend Developer", "location": "Monterrey"}


def create(client: TestClient, auth: AuthHeaders, **overrides: object) -> dict[str, object]:
    response = client.post(BASE, json={**JOB, **overrides}, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


def test_crud_flow(client: TestClient, auth: AuthHeaders) -> None:
    item = create(client, auth)
    assert item["status"] == "applied"
    assert item["applied_date"] == today_utc().isoformat()

    assert client.get(f"{BASE}/{item['id']}", headers=auth).json()["company"] == "FEMSA"

    patched = client.patch(
        f"{BASE}/{item['id']}",
        json={"status": "interview", "notes": "Technical round"},
        headers=auth,
    )
    assert patched.status_code == 200
    assert patched.json()["status"] == "interview"
    assert patched.json()["company"] == "FEMSA"

    assert client.delete(f"{BASE}/{item['id']}", headers=auth).status_code == 204
    assert client.get(f"{BASE}/{item['id']}", headers=auth).status_code == 404


def test_timestamps_are_timezone_aware_utc(client: TestClient, auth: AuthHeaders) -> None:
    # Regression: created_at used to come back naive, so JS read it as local time.
    item = create(client, auth)
    assert str(item["created_at"]).endswith(("Z", "+00:00"))


def test_pagination_returns_total(client: TestClient, auth: AuthHeaders) -> None:
    for index in range(5):
        create(client, auth, company=f"Company {index}")
    page = client.get(f"{BASE}?limit=2&offset=2", headers=auth).json()
    assert page["total"] == 5
    assert page["limit"] == 2
    assert page["offset"] == 2
    assert len(page["items"]) == 2


@pytest.mark.parametrize("query", ["limit=0", "limit=501", "offset=-1", "status=volando", "q="])
def test_list_rejects_bad_query_params(client: TestClient, auth: AuthHeaders, query: str) -> None:
    assert client.get(f"{BASE}?{query}", headers=auth).status_code == 422


def test_filter_and_search(client: TestClient, auth: AuthHeaders) -> None:
    create(client, auth)
    create(client, auth, company="Cemex", position="Data Analyst", status="offer")
    assert client.get(BASE, headers=auth).json()["total"] == 2
    offers = client.get(f"{BASE}?status=offer", headers=auth).json()["items"]
    assert [a["company"] for a in offers] == ["Cemex"]
    found = client.get(f"{BASE}?q=BACKEND", headers=auth).json()["items"]
    assert [a["company"] for a in found] == ["FEMSA"]


def test_search_treats_percent_and_underscore_literally(
    client: TestClient, auth: AuthHeaders
) -> None:
    # Regression: q=% used to match every row because LIKE wildcards were not escaped.
    create(client, auth, company="100% Real")
    create(client, auth, company="Other")
    assert client.get(f"{BASE}?q=%25", headers=auth).json()["total"] == 1
    assert client.get(f"{BASE}?q=_", headers=auth).json()["total"] == 0


@pytest.mark.parametrize(
    "payload",
    [
        {"status": "volando"},
        {"company": ""},
        {"company": "   "},
        {"company": "x" * 121},
        {"notes": "x" * 5001},
        {"url": "javascript:alert(document.cookie)"},
        {"url": "data:text/html,<script>alert(1)</script>"},
        {"url": "ftp://example.com/file"},
        {"url": "not a url"},
        {"unknown_field": "x"},
    ],
)
def test_create_rejects_invalid_input(
    client: TestClient, auth: AuthHeaders, payload: dict[str, object]
) -> None:
    # Regressions: javascript: URLs and 2 MB notes were accepted, unknown fields silently ignored.
    response = client.post(BASE, json={**JOB, **payload}, headers=auth)
    assert response.status_code == 422


def test_create_normalizes_input(client: TestClient, auth: AuthHeaders) -> None:
    item = create(
        client, auth, company="  Acme  ", location="  ", url="https://example.com/jobs", notes=""
    )
    assert item["company"] == "Acme"
    assert item["location"] is None
    assert item["notes"] is None
    assert item["url"] == "https://example.com/jobs"


@pytest.mark.parametrize("field", ["company", "position", "status", "applied_date"])
def test_patch_cannot_null_required_fields(
    client: TestClient, auth: AuthHeaders, field: str
) -> None:
    # Regression: PATCH {"company": null} used to crash with a 500 on a NOT NULL column.
    item = create(client, auth)
    response = client.patch(f"{BASE}/{item['id']}", json={field: None}, headers=auth)
    assert response.status_code == 422


def test_patch_can_clear_optional_fields(client: TestClient, auth: AuthHeaders) -> None:
    item = create(client, auth, notes="something")
    response = client.patch(
        f"{BASE}/{item['id']}", json={"notes": None, "location": None}, headers=auth
    )
    assert response.status_code == 200
    assert response.json()["notes"] is None
    assert response.json()["location"] is None


def test_patch_with_empty_body_changes_nothing(client: TestClient, auth: AuthHeaders) -> None:
    item = create(client, auth)
    response = client.patch(f"{BASE}/{item['id']}", json={}, headers=auth)
    assert response.status_code == 200
    assert response.json()["company"] == "FEMSA"


def test_users_cannot_touch_each_others_data(
    client: TestClient, auth: AuthHeaders, login: Callable[..., AuthHeaders]
) -> None:
    item = create(client, auth)
    other = login("otro@example.com")
    url = f"{BASE}/{item['id']}"
    assert client.get(url, headers=other).status_code == 404
    assert client.patch(url, json={"notes": "x"}, headers=other).status_code == 404
    assert client.delete(url, headers=other).status_code == 404
    assert client.get(f"{url}/history", headers=other).status_code == 404
    assert client.get(BASE, headers=other).json()["total"] == 0
    assert client.get(url, headers=auth).status_code == 200


def test_history_records_every_move(client: TestClient, auth: AuthHeaders) -> None:
    item = create(client, auth)
    client.patch(f"{BASE}/{item['id']}", json={"status": "interview"}, headers=auth)
    client.patch(f"{BASE}/{item['id']}", json={"notes": "no stage change"}, headers=auth)
    client.patch(f"{BASE}/{item['id']}", json={"status": "interview"}, headers=auth)
    client.patch(f"{BASE}/{item['id']}", json={"status": "offer"}, headers=auth)

    history = client.get(f"{BASE}/{item['id']}/history", headers=auth).json()
    assert [(e["from_status"], e["to_status"]) for e in history] == [
        (None, "applied"),
        ("applied", "interview"),
        ("interview", "offer"),
    ]


def test_quick_undo_erases_the_move_instead_of_inflating_the_funnel(
    client: TestClient, auth: AuthHeaders
) -> None:
    # A card dragged into Interview by accident and put back must not count as an interview.
    item = create(client, auth)
    client.patch(f"{BASE}/{item['id']}", json={"status": "interview"}, headers=auth)
    client.patch(f"{BASE}/{item['id']}", json={"status": "applied"}, headers=auth)

    history = client.get(f"{BASE}/{item['id']}/history", headers=auth).json()
    assert [(e["from_status"], e["to_status"]) for e in history] == [(None, "applied")]
    stats = client.get(f"{BASE}/stats", headers=auth).json()
    assert stats["reached_interview"] == 0


def test_a_late_reversal_is_kept_as_real_history(
    client: TestClient, auth: AuthHeaders, db: Session
) -> None:
    item = create(client, auth)
    client.patch(f"{BASE}/{item['id']}", json={"status": "interview"}, headers=auth)
    # Pretend all of it happened a while ago, keeping the events in their original order.
    events = db.scalars(select(ApplicationEvent).order_by(ApplicationEvent.id)).all()
    for index, event in enumerate(events):
        event.created_at = utcnow() - timedelta(minutes=20 - 10 * index)
    db.commit()
    assert [event.to_status for event in events] == [Status.APPLIED, Status.INTERVIEW]

    client.patch(f"{BASE}/{item['id']}", json={"status": "applied"}, headers=auth)
    history = client.get(f"{BASE}/{item['id']}/history", headers=auth).json()
    assert [(e["from_status"], e["to_status"]) for e in history] == [
        (None, "applied"),
        ("applied", "interview"),
        ("interview", "applied"),
    ]
    assert client.get(f"{BASE}/stats", headers=auth).json()["reached_interview"] == 1


def test_moving_forward_twice_is_never_treated_as_an_undo(
    client: TestClient, auth: AuthHeaders
) -> None:
    item = create(client, auth)
    for status in ("interview", "offer"):
        client.patch(f"{BASE}/{item['id']}", json={"status": status}, headers=auth)
    history = client.get(f"{BASE}/{item['id']}/history", headers=auth).json()
    assert [e["to_status"] for e in history] == ["applied", "interview", "offer"]


def test_created_in_a_later_stage_starts_history_there(
    client: TestClient, auth: AuthHeaders
) -> None:
    item = create(client, auth, status="interview")
    history = client.get(f"{BASE}/{item['id']}/history", headers=auth).json()
    assert [(e["from_status"], e["to_status"]) for e in history] == [(None, "interview")]


def test_stats_empty(client: TestClient, auth: AuthHeaders) -> None:
    data = client.get(f"{BASE}/stats", headers=auth).json()
    assert data["total"] == 0
    assert data["interview_rate"] == 0.0
    assert data["offer_rate"] == 0.0
    assert len(data["weekly"]) == 8
    assert all(week["count"] == 0 for week in data["weekly"])


def test_stats_count_stages_reached_not_just_current_column(
    client: TestClient, auth: AuthHeaders
) -> None:
    # Regression: an application that reached the interview and was then rejected used to
    # vanish from interview_rate, which understated how well the search was going.
    create(client, auth)
    rejected_after_interview = create(client, auth)
    client.patch(
        f"{BASE}/{rejected_after_interview['id']}", json={"status": "interview"}, headers=auth
    )
    client.patch(
        f"{BASE}/{rejected_after_interview['id']}", json={"status": "rejected"}, headers=auth
    )
    offer = create(client, auth)
    client.patch(f"{BASE}/{offer['id']}", json={"status": "interview"}, headers=auth)
    client.patch(f"{BASE}/{offer['id']}", json={"status": "offer"}, headers=auth)
    create(client, auth, status="rejected")

    data = client.get(f"{BASE}/stats", headers=auth).json()
    assert data["total"] == 4
    assert data["by_status"] == {"applied": 1, "interview": 0, "offer": 1, "rejected": 2}
    assert data["reached_interview"] == 2
    assert data["reached_offer"] == 1
    assert data["interview_rate"] == 0.5
    assert data["offer_rate"] == 0.25


def test_stats_are_per_user(
    client: TestClient, auth: AuthHeaders, login: Callable[..., AuthHeaders]
) -> None:
    create(client, auth, status="offer")
    other = login("otro@example.com")
    assert client.get(f"{BASE}/stats", headers=other).json()["total"] == 0


def test_weekly_stats_bucket_by_week(client: TestClient, auth: AuthHeaders) -> None:
    today = today_utc()
    monday = today - timedelta(days=today.weekday())
    create(client, auth, applied_date=monday.isoformat())
    create(client, auth, applied_date=(monday + timedelta(days=2)).isoformat())
    create(client, auth, applied_date=(monday - timedelta(days=7)).isoformat())
    create(client, auth, applied_date=(monday - timedelta(weeks=20)).isoformat())

    weekly = client.get(f"{BASE}/stats", headers=auth).json()["weekly"]
    assert weekly[-1] == {"week_start": monday.isoformat(), "count": 2}
    assert weekly[-2]["count"] == 1
    assert sum(week["count"] for week in weekly) == 3
    assert date.fromisoformat(weekly[0]["week_start"]) == monday - timedelta(weeks=7)
