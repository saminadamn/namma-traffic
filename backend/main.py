import asyncio
import logging
import sys
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import os
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from alembic.config import Config as AlembicConfig
from alembic import command as alembic_command
from routers import api, auth, admin, websocket, explain, simulate, whatif, command_center, demo, advisory, translate, routing, ml_predict, diversion
from services.model_service import ModelService
from config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("namma_traffic")

model_service = ModelService()

async def _migrate():
    try:
        cfg = AlembicConfig("alembic.ini")
        cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
        loop = asyncio.get_event_loop()
        with ThreadPoolExecutor(max_workers=1) as pool:
            await loop.run_in_executor(pool, lambda: alembic_command.upgrade(cfg, "head"))
        logger.info("Database migrations applied")
    except Exception as exc:
        logger.error("Migration error: %s", exc)


async def _ensure_schema():
    """Guarantee critical columns exist regardless of Alembic migration state.
    Uses engine autocommit + per-statement try/except so one missing table
    never silently blocks the rest of the columns from being added."""
    from core.database import engine
    from sqlalchemy import text
    stmts = [
        "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS road_status          VARCHAR(32)",
        "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS affected_road         TEXT",
        "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS severity_score        SMALLINT",
        "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS closure_probability   FLOAT",
        "ALTER TABLE incidents ADD COLUMN IF NOT EXISTS priority_probability  FLOAT",
        "ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS authenticated    BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS veh_type         VARCHAR(50)",
        "ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS incident_type    VARCHAR(20) DEFAULT 'unplanned'",
        "ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS closure_probability FLOAT",
        "ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS priority_probability FLOAT",
        "ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS risk_score       SMALLINT",
        "ALTER TABLE citizen_reports ADD COLUMN IF NOT EXISTS risk_band        VARCHAR(20)",
    ]
    ok = 0
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for stmt in stmts:
            try:
                conn.execute(text(stmt))
                ok += 1
            except Exception as exc:
                logger.warning("Schema patch skipped [%s]: %s", stmt[27:55], exc)
    logger.info("Schema ensured (%d/%d statements applied)", ok, len(stmts))


async def _score_pending():
    """Score any pending reports that arrived without ML scores (e.g. before a
    deploy that added inline scoring).  Runs once on startup, non-blocking."""
    try:
        from core.database import SessionLocal
        from services import incident_service
        with SessionLocal() as db:
            n = incident_service.score_pending_reports(db)
            if n:
                logger.info("Startup: scored %d pending reports", n)
    except Exception as exc:
        logger.warning("Startup scoring skipped: %s", exc)


async def _flush_hotspot_cache():
    """Delete the hotspot Redis cache on startup so stale entries never survive a deploy."""
    try:
        from core.redis_client import cache_delete
        await cache_delete("hotspots:cached")
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(_migrate())            # non-blocking: server starts immediately
    await _ensure_schema()                     # BLOCKING: columns must exist before first request
    asyncio.create_task(_score_pending())      # score unscored pending reports
    asyncio.create_task(_flush_hotspot_cache()) # evict stale hotspot cache on every deploy
    app.state.model_service = model_service
    logger.info("Namma Traffic API started (models load on first predict)")
    yield
    logger.info("Namma Traffic API shutting down")

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(title="Namma Traffic API", version="1.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Allow production Vercel URL, all Vercel preview URLs, and local dev.
# allow_origin_regex covers namma-traffic-*.vercel.app preview deployments.
_KNOWN_ORIGINS = [
    "https://namma-traffic-virid.vercel.app",
    "https://namma-traffic.onrender.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
_frontend = os.getenv("FRONTEND_URL", "").rstrip("/")
_extra    = [o.rstrip("/") for o in os.getenv("EXTRA_ORIGINS", "").split(",") if o.strip()]
_all_origins = list(dict.fromkeys(
    _KNOWN_ORIGINS + ([_frontend] if _frontend else []) + _extra
))
app.add_middleware(
    CORSMiddleware,
    allow_origins=_all_origins,
    allow_origin_regex=r"https://namma-traffic.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.predict_router,   prefix="/api/predict",   tags=["Predict"])
app.include_router(api.incidents_router, prefix="/api/incidents", tags=["Incidents"])
app.include_router(api.reports_router,   prefix="/api/reports",   tags=["Reports"])
app.include_router(api.heatmap_router,   prefix="/api/heatmap",   tags=["Heatmap"])
app.include_router(api.analytics_router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(api.weather_router,   prefix="/api/weather",   tags=["Weather"])

# Added for Priority 1 — auth/RBAC. Existing routers above are untouched.
app.include_router(auth.router,  prefix="/api/auth",  tags=["Auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])

# Added for Priority 2 — real-time incident push.
app.include_router(websocket.router, prefix="/ws", tags=["WebSocket"])

# Added for the SIH enhancement sprint (Features 1-3, 6-7). Feature 4
# (severity scoring) and Feature 5 (priority ranking) needed no new
# router — they're integrated into the existing incident_service /
# incidents_router instead. See docs for the full feature-to-file map.
app.include_router(explain.router,        prefix="/prediction/explain", tags=["Explainable AI"])
app.include_router(simulate.router,       prefix="/simulate-event",     tags=["Event Simulator"])
app.include_router(whatif.router,         prefix="/what-if",            tags=["What-If Analysis"])
app.include_router(command_center.router, prefix="/command-center",     tags=["Command Center"])
app.include_router(demo.router,           prefix="/generate-demo-data", tags=["Demo Data"])
app.include_router(advisory.router,       prefix="/api/advisory",       tags=["Advisory"])
app.include_router(translate.router,      prefix="/api/translate-batch", tags=["Translation"])
app.include_router(routing.router,        prefix="/api/route",           tags=["Safe Route"])
app.include_router(ml_predict.router,    prefix="/api/ml-predict",      tags=["Authority ML Predict"])
app.include_router(diversion.router,     prefix="/api",                 tags=["Diversion Planning Engine"])

@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception):
    """Catch-all so unhandled 500s are returned through FastAPI's ExceptionMiddleware
    (which sits inside CORSMiddleware). Without this, Starlette's ServerErrorMiddleware
    generates the 500 *outside* CORSMiddleware, so no Access-Control-Allow-Origin header
    is added and the browser reports a CORS error instead of the real 500."""
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    logger.error("Unhandled exception %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"})


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model_service.is_loaded}
