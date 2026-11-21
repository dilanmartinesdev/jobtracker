from http import HTTPStatus
from typing import Annotated, Any

from fastapi import APIRouter, Query

from app.dependencies import CurrentUser, DbSession
from app.models import Application, ApplicationEvent, Status
from app.schemas import (
    ApplicationCreate,
    ApplicationOut,
    ApplicationUpdate,
    ErrorResponse,
    EventOut,
    Page,
    StatsOut,
)
from app.services import applications as service

router = APIRouter(
    prefix="/applications",
    tags=["applications"],
    responses={401: {"model": ErrorResponse}},
)

NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"model": ErrorResponse}}


@router.get("", response_model=Page[ApplicationOut], summary="List applications")
def list_applications(
    user: CurrentUser,
    db: DbSession,
    status: Annotated[Status | None, Query(description="Only this stage")] = None,
    q: Annotated[
        str | None, Query(min_length=1, max_length=100, description="Search company or position")
    ] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[ApplicationOut]:
    items, total = service.list_applications(
        db, user, status=status, query=q, limit=limit, offset=offset
    )
    return Page(
        items=[ApplicationOut.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/stats", response_model=StatsOut, summary="Funnel statistics")
def read_stats(user: CurrentUser, db: DbSession) -> StatsOut:
    return service.get_stats(db, user)


@router.post(
    "",
    response_model=ApplicationOut,
    status_code=HTTPStatus.CREATED,
    summary="Create an application",
)
def create_application(data: ApplicationCreate, user: CurrentUser, db: DbSession) -> Application:
    return service.create_application(db, user, data)


@router.get(
    "/{application_id}",
    response_model=ApplicationOut,
    summary="Get one application",
    responses=NOT_FOUND,
)
def read_application(application_id: int, user: CurrentUser, db: DbSession) -> Application:
    return service.get_application(db, user, application_id)


@router.patch(
    "/{application_id}",
    response_model=ApplicationOut,
    summary="Update an application (also used to move it between stages)",
    responses=NOT_FOUND,
)
def update_application(
    application_id: int, data: ApplicationUpdate, user: CurrentUser, db: DbSession
) -> Application:
    return service.update_application(db, user, application_id, data)


@router.delete(
    "/{application_id}",
    status_code=HTTPStatus.NO_CONTENT,
    summary="Delete an application",
    responses=NOT_FOUND,
)
def delete_application(application_id: int, user: CurrentUser, db: DbSession) -> None:
    service.delete_application(db, user, application_id)


@router.get(
    "/{application_id}/history",
    response_model=list[EventOut],
    summary="Status changes of an application, oldest first",
    responses=NOT_FOUND,
)
def read_history(application_id: int, user: CurrentUser, db: DbSession) -> list[ApplicationEvent]:
    return service.list_events(db, user, application_id)
