"""
[Predict + Analytics + Weather: UNCHANGED from before Priority 2]
[Incidents + Reports: MODIFIED — now PostgreSQL-backed via services/incident_service.py,
 not the in-memory services/store.py lists]
[Heatmap.heatmap(): MODIFIED for the same reason — see inline note, this was a real bug
 caught during Priority 2 review, not an upfront design choice]
[Heatmap.hotspots(): UNCHANGED — independent hardcoded demo data]
"""
from fastapi import APIRouter, Depends, Request, UploadFile, File, Form
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
from schemas.schemas import EventInput, PredictionOutput, IncidentCreate, VerifyAction
from services import store, incident_service, upload_service, catboost_service, rules_engine
from core.database import get_db
from core.rbac import get_optional_user
from routers.websocket import manager
from core.redis_client import cache_delete
from datetime import datetime
import uuid, httpx, logging
from config import get_settings

_HOTSPOT_CACHE_KEY = "hotspots:cached"

logger = logging.getLogger("namma_traffic")

# ── Predict — ML model → Business Rules Engine ────────────────────────────────
predict_router = APIRouter()

@predict_router.post("", response_model=PredictionOutput)
async def predict_event(event: EventInput, request: Request):
    start_datetime = f"{event.date} {event.time}:00+00"

    # 1. CatBoost ML model → closure & priority probabilities
    try:
        ml = catboost_service.predict(
            event_type=event.incident_type,
            latitude=event.latitude,
            longitude=event.longitude,
            event_cause=event.event_type,
            authenticated=event.authenticated_reporter,
            veh_type=event.veh_type,
            start_datetime=start_datetime,
            description=event.description or "",
        )
    except Exception as exc:
        logger.warning("CatBoost unavailable (%s) — using heuristic fallback", exc)
        # Fallback: derive rough probabilities from the old model service
        old = request.app.state.model_service.predict(event)
        ml = {
            "closure_probability":  old["road_closure_probability"],
            "closure_prediction":   old["road_closure_probability"] >= 0.8,
            "priority_probability": old["risk_score"] / 100,
            "priority_prediction":  "High" if old["risk_score"] >= 55 else "Low",
        }

    # 2. Business Rules Engine → operational recommendations
    bre = rules_engine.evaluate(
        closure_probability=ml["closure_probability"],
        closure_prediction=ml["closure_prediction"],
        priority_probability=ml["priority_probability"],
        priority_prediction=ml["priority_prediction"],
        event_cause=event.event_type,
        corridor=event.corridor,
        weather=event.weather or "clear",
        crowd_size=event.crowd_size,
        date=event.date,
        time=event.time,
        description=event.description or "",
    )

    result = {
        **ml,
        **bre,
        "shap_features": [],
        # backward-compat alias so any old frontend code doesn't show NaN
        "road_closure_probability": ml["closure_probability"],
    }

    store.PREDICTIONS.append({
        "id": str(uuid.uuid4()), "event_type": event.event_type, "address": event.address,
        "risk_score": bre["risk_score"], "risk_band": bre["risk_band"],
        "created_at": datetime.utcnow().isoformat(),
    })
    return result

# ── Incidents ──────────────────────────────────────────────────  [MODIFIED — Priority 2]
incidents_router = APIRouter()

@incidents_router.get("")
def list_incidents(status: str = None, limit: int = 50, db=Depends(get_db)):
    return incident_service.list_incidents(db, status=status, limit=limit)

@incidents_router.get("/stats")
def stats(db=Depends(get_db)):
    return incident_service.incident_stats(db)

@incidents_router.get("/bbox")
def incidents_bbox(minLat: float, minLon: float, maxLat: float, maxLon: float, db=Depends(get_db)):
    """New endpoint — not yet called by the current frontend (no map
    viewport-driven loading exists there today), added because it's the
    natural pairing with the WebSocket bbox filter below and costs
    nothing to expose now rather than as a later, separate change."""
    return incident_service.incidents_in_bbox(db, minLat, minLon, maxLat, maxLon)

@incidents_router.get("/priority-ranking")
def priority_ranking(limit: int = 10, db=Depends(get_db)):
    """Feature 5 — Smart Priority Ranking. Added to the existing
    incidents_router rather than a new router file — this is incident
    data, ranked a different way, not a new resource."""
    return incident_service.top_priority_incidents(db, limit=limit)

@incidents_router.get("/corridor-risk")
def corridor_risk(db=Depends(get_db)):
    """Active incident severity aggregated by corridor — powers dashboard risk bars."""
    return incident_service.corridor_risk(db)

@incidents_router.get("/allocation")
def resource_allocation(db=Depends(get_db)):
    """ML-driven officer and barricade allocation per active incident.
    Uses closure_probability (CatBoost) + event_cause minimums from the
    rules engine — same formula as rules_engine.py but applied to stored incidents."""
    from db_models.incident import Incident
    from services.rules_engine import MIN_OFFICERS

    incidents = (
        db.query(Incident)
        .filter(Incident.status == "active")
        .order_by(Incident.created_at.desc())
        .all()
    )

    from services import severity_service
    result = []
    for inc in incidents:
        cp   = inc.closure_probability or 0.0
        ml_base = max(2, int(cp * 20))
        sev_label = (
            severity_service.label_for_score(inc.severity_score)
            if inc.severity_score is not None
            else inc.priority  # fallback to binary priority
        )
        sev_bonus = {"Critical": 6, "High": 4, "Medium": 2, "Low": 0}.get(sev_label, 0)
        ml_base += sev_bonus
        officers   = max(MIN_OFFICERS.get(inc.event_cause or "", 2), ml_base)
        barricades = max(1, int(cp * 15))

        result.append({
            "incident_id":         str(inc.id),
            "address":             inc.address,
            "zone":                inc.zone,
            "event_cause":         inc.event_cause,
            "priority":            inc.priority,
            "severity_label":      sev_label,
            "closure_probability": round(cp, 3),
            "officers_needed":     officers,
            "barricades_needed":   barricades,
            "diversion_required":  cp > 0.45 or inc.requires_road_closure,
        })

    result.sort(key=lambda x: x["officers_needed"], reverse=True)
    return result


@incidents_router.patch("/{incident_id}/complete")
async def complete_incident(incident_id: str, db=Depends(get_db)):
    """Authority ends an event — status → 'completed', releases all held resources."""
    from fastapi import HTTPException
    result = incident_service.complete_incident(db, incident_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    await manager.broadcast_all("resources_updated", {"incident_id": incident_id, "status": "completed"})
    await cache_delete(_HOTSPOT_CACHE_KEY)
    return result

@incidents_router.patch("/{incident_id}/resolve")
async def resolve_incident(incident_id: str, db=Depends(get_db)):
    """Mark an incident as resolved — releases its officers and barricades
    from the resource allocation count. Called by the Resources page when
    an officer confirms the event is over."""
    from fastapi import HTTPException
    result = incident_service.resolve_incident(db, incident_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Incident not found")
    await manager.broadcast_all("resources_updated", {"incident_id": incident_id, "status": "resolved"})
    await cache_delete(_HOTSPOT_CACHE_KEY)
    return result

@incidents_router.post("")
async def create_incident(inc: IncidentCreate, db=Depends(get_db)):
    incident_dict, was_new = incident_service.create_incident(db, inc.model_dump())
    await manager.broadcast("incident_created" if was_new else "incident_confirmed", incident_dict)
    await cache_delete(_HOTSPOT_CACHE_KEY)
    return incident_dict

# ── Reports ────────────────────────────────────────────────────  [MODIFIED — Priority 2]
reports_router = APIRouter()

@reports_router.get("")
def list_reports(status: str = None, db=Depends(get_db)):
    return incident_service.list_reports(db, status=status)

@reports_router.post("")
@limiter.limit("20/minute")
async def create_report(
    request: Request,
    category: str = Form(...), description: str = Form(...), address: str = Form(...),
    latitude: float = Form(...), longitude: float = Form(...),
    veh_type: str = Form(None), incident_type: str = Form("unplanned"),
    photo: UploadFile = File(None),
    db=Depends(get_db),
    current_user=Depends(get_optional_user),
):
    is_personnel = (
        current_user is not None and
        "traffic_personnel" in current_user.role_names()
    )
    photo_url = await upload_service.upload_photo(photo)
    report_dict = incident_service.create_report(
        db, category, description, address, latitude, longitude,
        photo_url=photo_url, veh_type=veh_type, incident_type=incident_type,
        reporter_id=current_user.id if current_user else None,
        authenticated=is_personnel,
    )
    if is_personnel:
        # Traffic personnel reports skip manual verification — auto-approve and create incident
        report_dict, incident_dict = incident_service.verify_report(
            db, report_dict["id"], "approve", verifier_id=current_user.id
        )
        if incident_dict:
            await manager.broadcast("incident_created", incident_dict)
            await cache_delete(_HOTSPOT_CACHE_KEY)
    else:
        from services.arq_service import enqueue
        await enqueue("geocode_report", report_dict["id"])
    return {"tracking_id": report_dict["tracking_id"], "status": report_dict["status"]}

@reports_router.patch("/verify")
async def verify(action: VerifyAction, db=Depends(get_db)):
    from fastapi import HTTPException as _HTTPException
    try:
        report_dict, incident_dict = incident_service.verify_report(db, action.report_id, action.action)
    except _HTTPException:
        raise
    except Exception as exc:
        logger.error("verify_report failed for %s: %s", action.report_id, exc, exc_info=True)
        raise _HTTPException(status_code=500, detail=str(exc))
    if incident_dict:
        await manager.broadcast("incident_created", incident_dict)
        await cache_delete(_HOTSPOT_CACHE_KEY)
    return {"message": f"Report {incident_service.ACTION_PAST_TENSE.get(action.action, action.action)}"}

# ── Heatmap ────────────────────────────────────────────────────
heatmap_router = APIRouter()

@heatmap_router.get("")
def heatmap(cause: str = None, db=Depends(get_db)):
    # [MODIFIED — Priority 2, bug caught in review] this used to read
    # store.INCIDENTS directly. Once incidents_router above moved to
    # Postgres, store.INCIDENTS stopped being written to at all — leaving
    # this function unchanged would have made it silently and permanently
    # return an empty heatmap with no error anywhere. Both had to move
    # together; flagging it here so the coupling is documented, not just
    # fixed.
    rows = incident_service.list_incidents(db, status="active", limit=10000)
    if cause and cause != "All":
        rows = [r for r in rows if r["event_cause"] == cause]
    points = []
    for r in rows:
        w = 2.0 if r["requires_road_closure"] else (1.5 if r["priority"] == "High" else 1.0)
        points.append([r["latitude"], r["longitude"], w])
    return {"points": points, "total": len(points)}

@heatmap_router.get("/hotspots")
async def hotspots(limit: int = 8, db=Depends(get_db)):
    # Serve from ARQ-populated Redis cache when available (refreshed every 15 min
    # by the recalculate_hotspots cron job in worker.py).  Falls back to a live
    # DBSCAN query when the cache is cold or Redis is not configured.
    import json
    from core.redis_client import cache_get
    cached = await cache_get("hotspots:cached")
    if cached:
        try:
            data = json.loads(cached)
            return data[:limit]
        except Exception:
            pass
    return incident_service.dbscan_hotspots(db, limit=limit)

# ── Analytics ─────────────────────────────────────────────────────────────────
analytics_router = APIRouter()

@analytics_router.get("/summary")
def summary(db=Depends(get_db)):
    return incident_service.analytics_summary(db)

# ── Weather ────────────────────────────────────────────────────  (UNCHANGED)
weather_router = APIRouter()

@weather_router.get("")
async def weather():
    s = get_settings()
    url = (f"https://api.open-meteo.com/v1/forecast?latitude={s.weather_lat}"
           f"&longitude={s.weather_lon}&hourly=rain&forecast_days=2&timezone=Asia%2FKolkata")
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            data = (await c.get(url)).json()
        rain = data.get("hourly", {}).get("rain", [0])
        mx = max(rain[:24]) if rain else 0
        risk = "severe" if mx > 30 else "high" if mx > 15 else "moderate" if mx > 5 else "low"
        return {"max_rain_24h_mm": round(mx, 1), "risk": risk, "monsoon_alert": mx > 10}
    except Exception:
        return {"max_rain_24h_mm": 0, "risk": "unknown", "monsoon_alert": False}
