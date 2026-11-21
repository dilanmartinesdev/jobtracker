"""Business logic for job applications.

Every function receives the current user and filters by ``user_id``, so one user can
never read or change another user's data no matter which id they ask for.
"""

from collections import Counter
from collections.abc import Sequence
from datetime import date, timedelta

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.errors import ApplicationNotFoundError
from app.models import Application, ApplicationEvent, Status, User, today_utc, utcnow
from app.schemas import ApplicationCreate, ApplicationUpdate, StatsOut, WeeklyCount

WEEKS_IN_CHART = 8
UNDO_WINDOW = timedelta(minutes=2)


def get_application(db: Session, user: User, application_id: int) -> Application:
    application = db.scalar(
        select(Application).where(Application.id == application_id, Application.user_id == user.id)
    )
    if application is None:
        raise ApplicationNotFoundError(application_id)
    return application


def list_applications(
    db: Session,
    user: User,
    *,
    status: Status | None = None,
    query: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[Sequence[Application], int]:
    """Return one page of applications plus the total number that match the filters."""
    stmt = select(Application).where(Application.user_id == user.id)
    if status is not None:
        stmt = stmt.where(Application.status == status)
    if query:
        # autoescape makes "%" and "_" match literally instead of acting as wildcards
        stmt = stmt.where(
            Application.company.icontains(query, autoescape=True)
            | Application.position.icontains(query, autoescape=True)
        )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    ordered = stmt.order_by(Application.applied_date.desc(), Application.id.desc())
    return db.scalars(ordered.limit(limit).offset(offset)).all(), total


def create_application(db: Session, user: User, data: ApplicationCreate) -> Application:
    application = Application(user_id=user.id, **data.model_dump())
    application.events.append(ApplicationEvent(from_status=None, to_status=data.status))
    db.add(application)
    db.commit()
    db.refresh(application)
    return application


def _record_status_change(application: Application, new_status: Status) -> None:
    """Append a history row for the move, unless it simply reverses the previous one.

    The funnel counts what an application *ever* reached, so a card dragged into Interview by
    mistake and put straight back would otherwise inflate the interview rate for good. Undoing
    the latest move within UNDO_WINDOW erases it instead of stacking a second row on top.
    """
    last = application.events[-1] if application.events else None
    is_quick_undo = (
        last is not None
        and last.from_status == new_status
        and utcnow() - last.created_at <= UNDO_WINDOW
    )
    if is_quick_undo and last is not None:
        application.events.remove(last)  # delete-orphan cascade deletes the row
    else:
        application.events.append(
            ApplicationEvent(from_status=application.status, to_status=new_status)
        )


def update_application(
    db: Session, user: User, application_id: int, data: ApplicationUpdate
) -> Application:
    application = get_application(db, user, application_id)
    changes = data.model_dump(exclude_unset=True)
    new_status = changes.get("status")
    if new_status is not None and new_status != application.status:
        _record_status_change(application, new_status)
    for field, value in changes.items():
        setattr(application, field, value)
    db.commit()
    db.refresh(application)
    return application


def delete_application(db: Session, user: User, application_id: int) -> None:
    db.delete(get_application(db, user, application_id))
    db.commit()


def list_events(db: Session, user: User, application_id: int) -> list[ApplicationEvent]:
    return list(get_application(db, user, application_id).events)


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _count_ever_reached(db: Session, user: User, stages: Sequence[Status]) -> int:
    """Applications that were in any of these stages at some point, even if they moved on."""
    return (
        db.scalar(
            select(func.count(distinct(ApplicationEvent.application_id)))
            .select_from(ApplicationEvent)
            .join(Application, Application.id == ApplicationEvent.application_id)
            .where(Application.user_id == user.id, ApplicationEvent.to_status.in_(stages))
        )
        or 0
    )


def get_stats(db: Session, user: User, today: date | None = None) -> StatsOut:
    """Funnel numbers computed from the status history, not just the current column.

    An application that reached the interview stage and was then rejected still counts
    as an interview, which is what a conversion rate should measure.
    """
    today = today or today_utc()
    counts = dict(
        db.execute(
            select(Application.status, func.count())
            .where(Application.user_id == user.id)
            .group_by(Application.status)
        ).all()
    )
    by_status = {status.value: counts.get(status, 0) for status in Status}
    total = sum(by_status.values())

    reached_interview = _count_ever_reached(db, user, [Status.INTERVIEW, Status.OFFER])
    reached_offer = _count_ever_reached(db, user, [Status.OFFER])

    first_week = _week_start(today) - timedelta(weeks=WEEKS_IN_CHART - 1)
    applied_dates = db.scalars(
        select(Application.applied_date).where(
            Application.user_id == user.id, Application.applied_date >= first_week
        )
    ).all()
    per_week = Counter(_week_start(day) for day in applied_dates)
    weekly = [
        WeeklyCount(week_start=week, count=per_week.get(week, 0))
        for week in (first_week + timedelta(weeks=i) for i in range(WEEKS_IN_CHART))
    ]

    return StatsOut(
        total=total,
        by_status=by_status,
        reached_interview=reached_interview,
        reached_offer=reached_offer,
        interview_rate=round(reached_interview / total, 3) if total else 0.0,
        offer_rate=round(reached_offer / total, 3) if total else 0.0,
        weekly=weekly,
    )
