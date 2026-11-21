from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.dependencies import DbSession

router = APIRouter(tags=["health"])


@router.get("/health", summary="Liveness: the process is up")
def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready", summary="Readiness: the database answers")
def ready(db: DbSession) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Database unavailable") from None
    return {"status": "ready"}
