"""Create a demo account filled with realistic but fictional applications.

Run from the backend folder after migrating the database:

    python -m scripts.seed           # create the demo account
    python -m scripts.seed --reset   # delete it first and start over

Sign in with demo@jobtracker.dev / demo-password-123.
"""

import argparse
from datetime import UTC, datetime, time, timedelta

from app.database import SessionLocal
from app.models import Application, ApplicationEvent, Status, today_utc
from app.services import users

DEMO_EMAIL = "demo@jobtracker.dev"
DEMO_PASSWORD = "demo-password-123"  # noqa: S105  # nosec B105 (public on purpose: demo data)

# company, position, location, days since applying, later stages as (status, days after the
# previous step), notes
SAMPLE: list[tuple[str, str, str, int, list[tuple[Status, int]], str]] = [
    (
        "Northwind Labs",
        "Junior Backend Developer",
        "Monterrey, NL",
        52,
        [(Status.INTERVIEW, 6), (Status.OFFER, 14)],
        "Python and FastAPI team. Verbal offer, waiting for the written one.",
    ),
    (
        "Brightline Systems",
        "Software Engineer I",
        "Remote (MX)",
        47,
        [(Status.INTERVIEW, 5), (Status.REJECTED, 9)],
        "Live coding round on graph traversal did not go well.",
    ),
    (
        "Cobaltix Analytics",
        "Junior Data Engineer",
        "Hybrid · San Pedro",
        44,
        [(Status.INTERVIEW, 4)],
        "Take-home SQL exercise due next week.",
    ),
    (
        "Helixa Cloud",
        "Cloud Support Associate",
        "Remote (LATAM)",
        41,
        [(Status.REJECTED, 12)],
        "Automatic rejection after the screening form.",
    ),
    (
        "Quantic Retail",
        "Full Stack Developer (Junior)",
        "Monterrey, NL",
        38,
        [(Status.INTERVIEW, 7)],
        "Panel with two engineers. React and Node.",
    ),
    (
        "Atlas Freight Tech",
        "QA Automation Intern",
        "Guadalupe, NL",
        35,
        [(Status.INTERVIEW, 3)],
        "Internship with a path to full-time. Second interview on Monday.",
    ),
    (
        "Evergreen Insurance",
        "Junior Software Tester",
        "Monterrey, NL",
        33,
        [(Status.REJECTED, 10)],
        "Position was filled internally.",
    ),
    (
        "Novapay",
        "Backend Engineer (Python)",
        "Remote (MX)",
        31,
        [(Status.REJECTED, 6)],
        "They wanted 3+ years of experience.",
    ),
    (
        "Verdant Energy",
        "IT Support Practicum",
        "Monterrey, NL",
        28,
        [(Status.REJECTED, 16)],
        "No reply for two weeks, then a form rejection.",
    ),
    ("Orbital Studio", "Junior Web Developer", "Remote (LATAM)", 24, [], ""),
    ("Mapleleaf Health", "Data Analyst Trainee", "Hybrid · Monterrey", 21, [], ""),
    ("Summit Robotics", "Software Developer Intern", "San Nicolás, NL", 18, [], ""),
    (
        "Lumen Security",
        "Junior Security Analyst",
        "Remote (MX)",
        15,
        [(Status.INTERVIEW, 5)],
        "Intro call went well. Technical screen is next.",
    ),
    ("Riverbend Software", "Python Developer", "Remote (MX)", 12, [], ""),
    ("Tidal Commerce", "Frontend Developer (React)", "Remote (LATAM)", 9, [], ""),
    ("Ironwood Logistics", "Junior DevOps Engineer", "Monterrey, NL", 6, [], ""),
    ("Skyline Fintech", "API Developer Intern", "Hybrid · San Pedro", 3, [], ""),
    ("Pixelforge Games", "Gameplay Programmer (Junior)", "Remote (LATAM)", 1, [], ""),
]


def slugify(name: str) -> str:
    return name.lower().replace(" ", "-")


def build_application(
    user_id: int,
    company: str,
    position: str,
    location: str,
    days_ago: int,
    path: list[tuple[Status, int]],
    notes: str,
) -> Application:
    applied_on = today_utc() - timedelta(days=days_ago)
    moment = datetime.combine(applied_on, time(9, 0), tzinfo=UTC)
    application = Application(
        user_id=user_id,
        company=company,
        position=position,
        status=Status.APPLIED,
        location=location,
        url=f"https://example.com/careers/{slugify(company)}",
        notes=notes or None,
        applied_date=applied_on,
        created_at=moment,
    )
    application.events.append(
        ApplicationEvent(from_status=None, to_status=Status.APPLIED, created_at=moment)
    )
    previous = Status.APPLIED
    for status, days_later in path:
        moment += timedelta(days=days_later)
        application.events.append(
            ApplicationEvent(from_status=previous, to_status=status, created_at=moment)
        )
        application.status = previous = status
    application.updated_at = moment
    return application


def seed(reset: bool) -> None:
    with SessionLocal() as db:
        existing = users.get_by_email(db, DEMO_EMAIL)
        if existing is not None and not reset:
            print(f"{DEMO_EMAIL} already exists. Use --reset to recreate it.")
            return
        if existing is not None:
            users.delete_user(db, existing)
        user = users.create_user(db, DEMO_EMAIL, DEMO_PASSWORD)
        for company, position, location, days_ago, path, notes in SAMPLE:
            db.add(build_application(user.id, company, position, location, days_ago, path, notes))
        db.commit()
    print(f"Demo account ready: {DEMO_EMAIL} / {DEMO_PASSWORD} ({len(SAMPLE)} applications)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the demo account")
    parser.add_argument("--reset", action="store_true", help="delete the demo account first")
    seed(parser.parse_args().reset)


if __name__ == "__main__":
    main()
