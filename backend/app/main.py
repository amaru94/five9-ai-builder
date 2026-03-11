"""Five9 AI Skill Engine - FastAPI application."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import get_settings
from app.core.logging import get_logger
from app.services.skill_registry import get_registry
from app.api.router import router as router_classify
from app.api.skills import router as skills_router
from app.api.workflows import router as workflows_router
from app.api.sessions import router as sessions_router
from app.api.runs import router as runs_router
from app.api.schemas import router as schemas_router

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: build skill registry. Shutdown: nothing."""
    get_registry().build_from_skills_dir()
    logger.info("app_started", extra={"app": get_settings().app_name})
    yield
    logger.info("app_shutdown")


app = FastAPI(
    title="Five9 AI Skill Engine",
    description="Backend for modular Five9 AI skill engine: classify, plan, execute REST/SOAP/Web2Campaign actions.",
    version="1.0.0",
    openapi_url="/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.include_router(router_classify)
app.include_router(skills_router)
app.include_router(workflows_router)
app.include_router(sessions_router)
app.include_router(runs_router)
app.include_router(schemas_router)


@app.get("/health")
def health():
    """Health check."""
    return {"status": "ok", "app": get_settings().app_name}
