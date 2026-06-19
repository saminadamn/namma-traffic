import logging
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from routers import api, auth, admin, websocket, explain, simulate, whatif, command_center, demo, advisory, translate, routing
from services.model_service import ModelService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("namma_traffic")

model_service = ModelService()

@asynccontextmanager
async def lifespan(app: FastAPI):
    model_service.load()
    app.state.model_service = model_service
    logger.info("Namma Traffic API started — model_loaded=%s", model_service.is_loaded)
    yield
    logger.info("Namma Traffic API shutting down")

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(title="Namma Traffic API", version="1.0.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_frontend = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[_frontend, "http://localhost:3000"],
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

@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model_service.is_loaded}
