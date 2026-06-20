"""
ARQ background worker.

Start alongside uvicorn:
    arq worker.WorkerSettings

Requires REDIS_URL in .env (Upstash free tier works fine):
    REDIS_URL=rediss://default:xxx@host.upstash.io:6379

Jobs defined here:
  geocode_report       -- reverse-geocode a citizen report's lat/lon via
                          Nominatim and update its address in the DB.
                          Enqueued by routers/api.py after every report POST.

  recalculate_hotspots -- run DBSCAN on live incidents and cache the result
                          in Redis (key: hotspots:cached, TTL 15 min).
                          Cron: every 15 minutes.
                          The /api/heatmap/hotspots endpoint reads this
                          cache, falling back to a live query if empty.
"""
import json
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import httpx
from arq import cron
from arq.connections import RedisSettings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("namma_traffic.worker")

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
_HOTSPOT_CACHE_KEY = "hotspots:cached"
_HOTSPOT_TTL = 900  # 15 minutes


# ── Jobs ─────────────────────────────────────────────────────────────────────


async def geocode_report(ctx, report_id: str) -> None:
    """Reverse-geocode a citizen report and update its address if blank/short."""
    from core.database import SessionLocal
    from db_models.incident import CitizenReport

    db = SessionLocal()
    try:
        report = db.get(CitizenReport, report_id)
        if report is None:
            logger.warning("geocode_report: report %s not found", report_id)
            return

        # Skip if the address already looks detailed (has a comma = road + area)
        existing = (report.address or "").strip()
        if len(existing) > 8 and "," in existing:
            logger.debug("geocode_report: report %s already has address, skipping", report_id)
            return

        if not report.latitude or not report.longitude:
            return

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                _NOMINATIM_URL,
                params={
                    "lat": report.latitude,
                    "lon": report.longitude,
                    "format": "json",
                    "zoom": 17,
                    "addressdetails": 1,
                },
                headers={"User-Agent": "namma-traffic-sih/1.0 (bengaluru-traffic-intelligence)"},
            )
            resp.raise_for_status()
            data = resp.json()

        # Build a short human-readable address: "Road Name, Neighbourhood"
        addr_parts = data.get("address", {})
        components = [
            addr_parts.get("road") or addr_parts.get("pedestrian") or addr_parts.get("path"),
            addr_parts.get("suburb") or addr_parts.get("neighbourhood") or addr_parts.get("village"),
            addr_parts.get("city") or addr_parts.get("town"),
        ]
        address = ", ".join(p for p in components if p)

        if not address:
            # Fall back to first two parts of display_name
            display = data.get("display_name", "")
            parts = [p.strip() for p in display.split(",")[:2]]
            address = ", ".join(p for p in parts if p)

        if address:
            report.address = address
            db.commit()
            logger.info("geocode_report: report %s -> %s", report_id, address)

        # ── ML scoring ────────────────────────────────────────────────────────
        # Run CatBoost + BRE on the report so the authority queue can be sorted
        # by risk_score DESC instead of FIFO. Failures are non-fatal — the
        # report stays visible, just without a score (shown as "Scoring…").
        try:
            from services import catboost_service, rules_engine
            from datetime import datetime as _dt, timezone

            now = _dt.now(timezone.utc)
            event_cause = (report.category or "others").lower().replace(" ", "_")

            ml = catboost_service.predict(
                event_type=getattr(report, "incident_type", None) or "unplanned",
                latitude=report.latitude,
                longitude=report.longitude,
                event_cause=event_cause,
                authenticated=report.reporter_id is not None,
                veh_type=getattr(report, "veh_type", None),
                start_datetime=now.isoformat(),
                description=report.description or "",
            )
            bre = rules_engine.evaluate(
                closure_probability=ml["closure_probability"],
                closure_prediction=ml["closure_prediction"],
                priority_probability=ml["priority_probability"],
                priority_prediction=ml["priority_prediction"],
                event_cause=event_cause,
                date=now.strftime("%Y-%m-%d"),
                time=now.strftime("%H:%M"),
            )
            report = db.get(CitizenReport, report_id)   # re-fetch after potential address commit
            if report:
                report.closure_probability = ml["closure_probability"]
                report.priority_probability = ml["priority_probability"]
                report.risk_score = bre["risk_score"]
                report.risk_band = bre["risk_band"]
                db.commit()
                logger.info(
                    "geocode_report: scored %s → risk=%s (%s)",
                    report_id, bre["risk_score"], bre["risk_band"],
                )
        except Exception as ml_exc:
            logger.warning("geocode_report: ML scoring skipped for %s: %s", report_id, ml_exc)
            db.rollback()

    except Exception as exc:
        logger.warning("geocode_report failed for %s: %s", report_id, exc)
        db.rollback()
    finally:
        db.close()


async def recalculate_hotspots(ctx) -> None:
    """Run DBSCAN on live incidents and cache the result in Redis."""
    from core.database import SessionLocal
    from services.incident_service import dbscan_hotspots

    db = SessionLocal()
    try:
        hotspots = dbscan_hotspots(db, limit=8)
        payload = json.dumps(hotspots)
        redis = ctx["redis"]
        await redis.setex(_HOTSPOT_CACHE_KEY, _HOTSPOT_TTL, payload)
        logger.info("recalculate_hotspots: cached %d clusters", len(hotspots))
    except Exception as exc:
        logger.warning("recalculate_hotspots failed: %s", exc)
    finally:
        db.close()


# ── Lifecycle ─────────────────────────────────────────────────────────────────


async def startup(ctx) -> None:
    logger.info("ARQ worker started")
    # Prime the hotspot cache immediately on startup so the first request
    # doesn't have to wait up to 15 minutes for the first cron tick.
    await recalculate_hotspots(ctx)


async def shutdown(ctx) -> None:
    logger.info("ARQ worker stopped")


# ── WorkerSettings ────────────────────────────────────────────────────────────

_REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(_REDIS_URL)
    functions = [geocode_report, recalculate_hotspots]
    cron_jobs = [
        cron(recalculate_hotspots, minute={0, 15, 30, 45}),
    ]
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 10
    job_timeout = 30  # seconds — Nominatim calls are fast, 30s is generous
