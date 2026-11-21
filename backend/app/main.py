"""Application entry point: builds the FastAPI app and wires everything together."""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.errors import ApplicationNotFoundError, EmailAlreadyRegisteredError
from app.ratelimit import limiter
from app.routers import applications, auth, health

TAGS = [
    {"name": "auth", "description": "Sign up, sign in and manage the current account."},
    {"name": "applications", "description": "Create, move and review job applications."},
    {"name": "health", "description": "Liveness and readiness probes."},
]


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="JobTracker API",
        description="Track job applications on a Kanban board, with history and funnel stats.",
        version="1.0.0",
        openapi_tags=TAGS,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )
    app.state.limiter = limiter

    # Tokens travel in the Authorization header, so cookies (allow_credentials) are not needed.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    for router in (health.router, auth.router, applications.router):
        app.include_router(router, prefix="/api")

    @app.exception_handler(ApplicationNotFoundError)
    async def application_not_found(_: Request, __: ApplicationNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=404, content={"detail": "Application not found"})

    @app.exception_handler(EmailAlreadyRegisteredError)
    async def email_taken(_: Request, __: EmailAlreadyRegisteredError) -> JSONResponse:
        return JSONResponse(status_code=409, content={"detail": "Email is already registered"})

    @app.exception_handler(RateLimitExceeded)
    async def too_many_requests(_: Request, __: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many attempts. Please wait a minute and try again."},
            headers={"Retry-After": "60"},
        )

    return app


app = create_app()
