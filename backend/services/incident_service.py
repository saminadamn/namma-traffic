"""
Incident and citizen-report business logic, backed by PostgreSQL/PostGIS.

Replaces services/store.py's INCIDENTS and REPORTS lists. store.py itself
is NOT deleted — store.PREDICTIONS (the prediction-call audit log) still
uses it, deliberately, since giving predictions a real table is Priority
4's job, not this PR's.
"""
import random
import string
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import case, func, text
from sqlalchemy.orm import Session

from db_models.incident import CitizenReport, Incident
from services import priority_service, severity_service

DEDUP_RADIUS_M = 150
DEDUP_WINDOW_MINUTES = 10

_postgis_ok: bool | None = None  # cached after first DB contact


def _has_postgis(db: Session) -> bool:
    global _postgis_ok
    if _postgis_ok is None:
        try:
            db.execute(text("SELECT PostGIS_Version()"))
            _postgis_ok = True
        except Exception:
            db.rollback()
            _postgis_ok = False
    return _postgis_ok

# Past-tense verify messages. EXISTING BUG FIXED HERE: the original
# routers/api.py built this with f"Report {action.action}d", which is
# correct for "approve" -> "approved" but produces "Report rejectd" for
# "reject" (missing the 'e') — a real, shipped typo. Spelling it out
# explicitly instead of string-concatenating past tense fixes it for good.
ACTION_PAST_TENSE = {"approve": "approved", "reject": "rejected", "pending": "set to pending"}


def _geography_point(lat: float, lon: float):
    """Builds a PostGIS geography literal via ST_GeogFromText, not
    ST_SetSRID(ST_MakePoint(...), 4326). The latter returns a `geometry`,
    and comparing a geometry argument against a geography column inside
    ST_DWithin is a common, easy-to-make PostGIS mistake — there are two
    different ST_DWithin overloads (planar vs. spherical), and mixing
    geometry/geography types can silently select the wrong one.
    ST_GeogFromText returns a geography directly, removing the ambiguity."""
    return func.ST_GeogFromText(f"SRID=4326;POINT({lon} {lat})")


def _incident_to_dict(inc: Incident) -> dict:
    return {
        "id": str(inc.id),
        "event_type": inc.event_type,
        "event_cause": inc.event_cause,
        "latitude": inc.latitude,
        "longitude": inc.longitude,
        "address": inc.address,
        "corridor": inc.corridor,
        "zone": inc.zone,
        "police_station": inc.police_station,
        "priority": inc.priority,
        "status": inc.status,
        "requires_road_closure": inc.requires_road_closure,
        "description": inc.description or "",
        "start_datetime": inc.start_datetime.isoformat() if inc.start_datetime else None,
        # Added for Feature 4 (Incident Severity Scoring). severity_score
        # itself is an existing-but-previously-unused column from
        # Priority 2 (db_models/incident.py) — see create_incident()
        # below for where it's now actually populated.
        "severity_score": inc.severity_score,
        "severity_label": severity_service.label_for_score(inc.severity_score) if inc.severity_score is not None else None,
        "closure_probability": inc.closure_probability,
        "priority_probability": inc.priority_probability,
    }


def _report_to_dict(r: CitizenReport) -> dict:
    return {
        "id": str(r.id),
        "tracking_id": r.tracking_id,
        "category": r.category,
        "description": r.description or "",
        "address": r.address,
        "latitude": r.latitude,
        "longitude": r.longitude,
        "photo_url": r.photo_url,
        "status": r.status,
        "veh_type": r.veh_type,
        "incident_type": r.incident_type or "unplanned",
        "created_at": r.created_at.isoformat() if r.created_at else None,
        # ML scores — None until the background worker runs
        "closure_probability": r.closure_probability,
        "priority_probability": r.priority_probability,
        "risk_score": r.risk_score,
        "risk_band": r.risk_band,
        "authenticated": r.authenticated,
    }


def top_priority_incidents(db: Session, limit: int = 10) -> list[dict]:
    """Feature 5 — Smart Priority Ranking. Pulls active incidents and
    delegates the actual ranking math to priority_service.rank_incidents
    (a pure function, unit-tested separately) rather than mixing DB
    access and ranking logic in one place."""
    active = list_incidents(db, status="active", limit=500)
    return priority_service.rank_incidents(active, limit=limit)


def active_road_closure_count(db: Session) -> int:
    """Feature 6 (Command Center) — deliberately a NEW, separate query
    rather than reusing incident_stats()['road_closures'], which counts
    road-closure incidents regardless of status. 'Emergency Routes
    Active' should mean active right now, not ever-logged."""
    return (
        db.query(func.count(Incident.id))
        .filter(Incident.status == "active")
        .filter(Incident.requires_road_closure.is_(True))
        .scalar()
    ) or 0


def find_duplicate_incident(db: Session, lat: float, lon: float) -> Incident | None:
    """Is there already an active incident within DEDUP_RADIUS_M meters,
    started in the last DEDUP_WINDOW_MINUTES? If so, the caller bumps its
    confirmation_count instead of creating a new row — several citizens
    reporting the same flooded underpass shouldn't become several pins.
    Skipped entirely when PostGIS is unavailable (local dev without extension)."""
    if not _has_postgis(db):
        return None
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=DEDUP_WINDOW_MINUTES)
    return (
        db.query(Incident)
        .filter(Incident.status == "active")
        .filter(Incident.start_datetime >= cutoff)
        .filter(func.ST_DWithin(Incident.location, _geography_point(lat, lon), DEDUP_RADIUS_M))
        .first()
    )


def create_incident(db: Session, data: dict, reporter_id=None) -> tuple[dict, bool]:
    """Returns (incident_dict, was_new). was_new=False means an existing
    incident's confirmation_count was bumped instead of inserting a row —
    routers/api.py uses this to decide which WS event type to broadcast."""
    duplicate = find_duplicate_incident(db, data["latitude"], data["longitude"])
    if duplicate is not None:
        duplicate.confirmation_count += 1
        db.commit()
        return _incident_to_dict(duplicate), False

    incident = Incident(
        reporter_id=reporter_id,
        event_type=data["event_type"],
        event_cause=data["event_cause"],
        location=_geography_point(data["latitude"], data["longitude"]) if _has_postgis(db) else None,
        latitude=data["latitude"],
        longitude=data["longitude"],
        address=data["address"],
        corridor=data.get("corridor"),
        zone=data.get("zone"),
        police_station=data.get("police_station"),
        priority=data.get("priority", "High"),
        requires_road_closure=data.get("requires_road_closure", False),
        description=data.get("description", ""),
        status="active",
        # Feature 4 — Incident Severity Scoring. Reuses
        # priority_service.congestion_impact_score() for the "nearby
        # congestion" input rather than inventing a second zone->
        # congestion mapping that could disagree with the one Feature 5's
        # ranking already uses for the same zone.
        severity_score=severity_service.score_severity(
            incident_type=data["event_cause"],
            nearby_congestion_pct=priority_service.congestion_impact_score(data.get("zone")),
            hour_of_day=datetime.now(timezone.utc).hour,
            requires_road_closure=data.get("requires_road_closure", False),
        )["severity_score"],
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    # ML scoring — run CatBoost immediately so the priority ranking widget
    # can incorporate closure_probability. Failures are non-fatal.
    try:
        from services import catboost_service
        now = datetime.now(timezone.utc)
        ml = catboost_service.predict(
            event_type=data.get("incident_type", "unplanned"),
            latitude=data["latitude"],
            longitude=data["longitude"],
            event_cause=data["event_cause"],
            authenticated=True,          # authority-created incident
            veh_type=data.get("veh_type"),
            start_datetime=now.isoformat(),
            description=data.get("description", ""),
        )
        incident.closure_probability  = ml["closure_probability"]
        incident.priority_probability = ml["priority_probability"]
        incident.priority             = ml["priority_prediction"]   # sync binary priority from ML
        db.commit()
        db.refresh(incident)
    except Exception:
        pass   # scoring failure must not block incident creation

    return _incident_to_dict(incident), True


def complete_incident(db: Session, incident_id: str) -> dict | None:
    """Authority explicitly ends an event: status → 'completed', resources released."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if inc is None:
        return None
    inc.status = "completed"
    inc.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inc)
    return _incident_to_dict(inc)


def resolve_incident(db: Session, incident_id: str) -> dict | None:
    """Mark an incident as resolved, stamp resolved_at, and return the
    updated dict. Returns None if the ID doesn't exist or is already
    resolved so the router can return 404 / 409 appropriately."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if inc is None:
        return None
    inc.status      = "resolved"
    inc.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inc)
    return _incident_to_dict(inc)


def list_incidents(db: Session, status: str | None = None, limit: int = 50) -> list[dict]:
    q = db.query(Incident)
    if status:
        q = q.filter(Incident.status == status)
    rows = q.order_by(Incident.start_datetime.desc()).limit(limit).all()
    return [_incident_to_dict(r) for r in rows]


def incidents_in_bbox(db: Session, min_lat: float, min_lon: float, max_lat: float, max_lon: float) -> list[dict]:
    """Map-viewport query. See db_models/incident.py point (2) for why
    this is a plain float range filter, not a PostGIS envelope."""
    rows = (
        db.query(Incident)
        .filter(Incident.latitude.between(min_lat, max_lat))
        .filter(Incident.longitude.between(min_lon, max_lon))
        .filter(Incident.status == "active")
        .all()
    )
    return [_incident_to_dict(r) for r in rows]


def incident_stats(db: Session) -> dict:
    total = db.query(func.count(Incident.id)).scalar()
    active = db.query(func.count(Incident.id)).filter(Incident.status == "active").scalar()
    high_priority = db.query(func.count(Incident.id)).filter(
        Incident.status == "active", Incident.priority == "High"
    ).scalar()
    road_closures = db.query(func.count(Incident.id)).filter(
        Incident.status == "active", Incident.requires_road_closure.is_(True)
    ).scalar()
    return {
        "total": total or 0,
        "active": active or 0,
        "high_priority": high_priority or 0,
        "road_closures": road_closures or 0,
    }


def analytics_summary(db: Session) -> dict:
    """Real SQL aggregates for the analytics dashboard.
    All four scalars in one query via CASE to avoid four round-trips."""
    total, active, high_priority, road_closures = db.query(
        func.count(Incident.id),
        func.count(case((Incident.status == "active", 1))),
        func.count(case((Incident.priority == "High", 1))),
        func.count(case((Incident.requires_road_closure.is_(True), 1))),
    ).one()

    top_causes = (
        db.query(Incident.event_cause, func.count(Incident.id).label("cnt"))
        .group_by(Incident.event_cause)
        .order_by(func.count(Incident.id).desc())
        .limit(6)
        .all()
    )

    top_zones = (
        db.query(Incident.zone, func.count(Incident.id).label("cnt"))
        .filter(Incident.zone.isnot(None))
        .filter(Incident.zone != "")
        .filter(Incident.zone != "Unknown")
        .group_by(Incident.zone)
        .order_by(func.count(Incident.id).desc())
        .limit(6)
        .all()
    )

    month_label = func.to_char(Incident.start_datetime, "Mon")
    month_num = func.extract("month", Incident.start_datetime)
    current_year = func.extract("year", func.now())
    monthly_trend = (
        db.query(month_label.label("month"), month_num.label("month_num"), func.count(Incident.id).label("cnt"))
        .filter(func.extract("year", Incident.start_datetime) == current_year)
        .group_by(month_label, month_num)
        .order_by(month_num)
        .all()
    )

    return {
        "total_incidents": total or 0,
        "high_priority": high_priority or 0,
        "road_closures": road_closures or 0,
        "active": active or 0,
        "top_causes": [{"cause": r.event_cause, "count": r.cnt} for r in top_causes],
        "top_zones": [{"zone": r.zone, "count": r.cnt} for r in top_zones],
        "monthly_trend": [{"month": r.month, "count": r.cnt} for r in monthly_trend],
    }


# 500 m radius, 2 incidents minimum — tuned so even a small demo DB produces clusters.
_DBSCAN_EPS_KM = 0.5
_DBSCAN_MIN_SAMPLES = 2


def dbscan_hotspots(db: Session, limit: int = 8) -> list[dict]:
    """DBSCAN clustering on active incidents only. Returns [] when there are
    fewer active incidents than _DBSCAN_MIN_SAMPLES."""
    import numpy as np
    from collections import Counter
    from sklearn.cluster import DBSCAN

    rows = db.query(
        Incident.latitude,
        Incident.longitude,
        Incident.event_cause,
        Incident.address,
    ).filter(Incident.status == "active").all()

    if len(rows) < _DBSCAN_MIN_SAMPLES:
        return []

    coords = np.array([[r.latitude, r.longitude] for r in rows])
    # haversine metric expects radians; eps must also be in radians
    eps_rad = _DBSCAN_EPS_KM / 6371.0
    labels = DBSCAN(
        eps=eps_rad,
        min_samples=_DBSCAN_MIN_SAMPLES,
        algorithm="ball_tree",
        metric="haversine",
    ).fit_predict(np.radians(coords))

    clusters: dict[int, dict] = {}
    for i, label in enumerate(labels):
        if label == -1:
            continue
        c = clusters.setdefault(label, {"lats": [], "lons": [], "causes": [], "addresses": []})
        c["lats"].append(coords[i, 0])
        c["lons"].append(coords[i, 1])
        c["causes"].append(rows[i].event_cause)
        c["addresses"].append(rows[i].address)

    if not clusters:
        return _STATIC_HOTSPOTS[:limit]

    results = []
    for data in clusters.values():
        dominant_cause = Counter(data["causes"]).most_common(1)[0][0]
        # First comma-segment of the most-common address gives a readable name
        junction = Counter(data["addresses"]).most_common(1)[0][0].split(",")[0].strip()
        results.append({
            "junction": junction,
            "count": len(data["lats"]),
            "lat": round(float(np.mean(data["lats"])), 6),
            "lon": round(float(np.mean(data["lons"])), 6),
            "dominant_cause": dominant_cause,
        })

    results.sort(key=lambda x: x["count"], reverse=True)
    return results[:limit]


def _generate_tracking_id() -> str:
    return "RPT-2026-" + "".join(random.choices(string.digits, k=4))


def create_report(
    db: Session, category: str, description: str, address: str,
    latitude: float, longitude: float, photo_url: str | None,
    reporter_id=None, veh_type: str | None = None, incident_type: str = "unplanned",
    authenticated: bool = False,
) -> dict:
    report = CitizenReport(
        reporter_id=reporter_id,
        tracking_id=_generate_tracking_id(),
        category=category,
        description=description,
        address=address,
        location=_geography_point(latitude, longitude) if _has_postgis(db) else None,
        latitude=latitude,
        longitude=longitude,
        photo_url=photo_url,
        status="pending",
        veh_type=veh_type or None,
        incident_type=incident_type or "unplanned",
        authenticated=authenticated,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    # Run ML scoring synchronously — ARQ worker does the same thing but requires
    # Redis. Running inline means scores are available immediately in the verify
    # queue without any background infrastructure.
    try:
        from services import catboost_service, rules_engine as _bre
        _now = datetime.now(timezone.utc)
        _cause = (category or "others").lower().replace(" ", "_")
        ml = catboost_service.predict(
            event_type=incident_type or "unplanned",
            latitude=latitude,
            longitude=longitude,
            event_cause=_cause,
            authenticated=authenticated,
            veh_type=veh_type,
            start_datetime=_now.isoformat(),
            description=description or "",
        )
        bre = _bre.evaluate(
            closure_probability=ml["closure_probability"],
            closure_prediction=ml["closure_prediction"],
            priority_probability=ml["priority_probability"],
            priority_prediction=ml["priority_prediction"],
            event_cause=_cause,
            date=_now.strftime("%Y-%m-%d"),
            time=_now.strftime("%H:%M"),
        )
        report.closure_probability  = ml["closure_probability"]
        report.priority_probability = ml["priority_probability"]
        report.risk_score           = bre["risk_score"]
        report.risk_band            = bre["risk_band"]
        db.commit()
        db.refresh(report)
    except Exception as _exc:
        import logging as _log
        _log.getLogger("namma_traffic.scoring").warning(
            "Inline ML scoring failed for report %s: %s", report.id, _exc
        )

    return _report_to_dict(report)


def score_pending_reports(db: Session) -> int:
    """Score all pending CitizenReports that have no risk_score yet.
    Called on startup so reports submitted before a code deploy get scored."""
    from datetime import datetime as _dt, timezone as _tz
    import logging as _log
    _logger = _log.getLogger("namma_traffic.scoring")

    unscored = (
        db.query(CitizenReport)
        .filter(CitizenReport.status == "pending")
        .filter(CitizenReport.risk_score.is_(None))
        .all()
    )
    if not unscored:
        return 0

    try:
        from services import catboost_service, rules_engine as _bre
    except Exception as e:
        _logger.warning("ML services unavailable for batch scoring: %s", e)
        return 0

    scored = 0
    for report in unscored:
        try:
            _now = _dt.now(_tz.utc)
            _cause = (report.category or "others").lower().replace(" ", "_")
            ml = catboost_service.predict(
                event_type=report.incident_type or "unplanned",
                latitude=report.latitude,
                longitude=report.longitude,
                event_cause=_cause,
                authenticated=report.authenticated,
                veh_type=report.veh_type,
                start_datetime=_now.isoformat(),
                description=report.description or "",
            )
            bre = _bre.evaluate(
                closure_probability=ml["closure_probability"],
                closure_prediction=ml["closure_prediction"],
                priority_probability=ml["priority_probability"],
                priority_prediction=ml["priority_prediction"],
                event_cause=_cause,
                date=_now.strftime("%Y-%m-%d"),
                time=_now.strftime("%H:%M"),
            )
            report.closure_probability  = ml["closure_probability"]
            report.priority_probability = ml["priority_probability"]
            report.risk_score           = bre["risk_score"]
            report.risk_band            = bre["risk_band"]
            scored += 1
        except Exception as e:
            _logger.warning("Batch scoring failed for report %s: %s", report.id, e)
    if scored:
        db.commit()
        _logger.info("Batch scored %d previously-unscored pending reports", scored)
    return scored


def list_reports(db: Session, status: str | None = None) -> list[dict]:
    q = db.query(CitizenReport)
    if status:
        q = q.filter(CitizenReport.status == status)
    # Pending queue: highest ML risk score first so authorities triage correctly.
    # All other views: newest first.
    if status == "pending":
        from sqlalchemy import nullslast
        rows = q.order_by(nullslast(CitizenReport.risk_score.desc()), CitizenReport.created_at.desc()).all()
    else:
        rows = q.order_by(CitizenReport.created_at.desc()).all()
    return [_report_to_dict(r) for r in rows]


def corridor_risk(db: Session, limit: int = 6) -> list[dict]:
    """Aggregate active incidents by corridor → risk bar data for the dashboard.
    Risk is a blend of average severity (0-100) and incident count bonus."""
    rows = (
        db.query(
            Incident.corridor,
            func.count(Incident.id).label("count"),
            func.avg(Incident.severity_score).label("avg_severity"),
        )
        .filter(Incident.status == "active")
        .filter(Incident.corridor.isnot(None))
        .filter(Incident.corridor != "Unknown")
        .group_by(Incident.corridor)
        .order_by(func.count(Incident.id).desc())
        .limit(limit)
        .all()
    )
    result = []
    for row in rows:
        count_bonus = min(row.count * 4, 25)          # up to +25 for volume
        avg_sev = round(row.avg_severity or 50, 1)
        risk = min(100, int(avg_sev + count_bonus))
        result.append({"name": row.corridor, "risk": risk, "count": row.count})
    return result


def _to_uuid_or_400(raw_id: str, label: str) -> uuid.UUID:
    """Path/body params arrive as plain strings. The Uuid PK columns
    expect real uuid.UUID Python objects, not strings, when used in
    db.get()/filters — converting explicitly here (rather than relying
    on implicit coercion that varies across SQLAlchemy versions) and
    turning a malformed ID into a clean 400 instead of a 500."""
    try:
        return uuid.UUID(raw_id)
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {label}: {raw_id!r}")


def verify_report(db: Session, report_id: str, action: str, verifier_id=None) -> tuple[dict, dict | None]:
    """Returns (report_dict, new_incident_dict_or_None). The incident
    dict is non-None only when approval created/confirmed an incident —
    routers/api.py uses that to decide whether to broadcast."""
    report = db.get(CitizenReport, _to_uuid_or_400(report_id, "report_id"))
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    report.status = "approved" if action == "approve" else action
    report.verified_by_id = verifier_id

    incident_dict = None
    if action == "approve":
        incident_data = {
            "event_type": report.category.lower().replace(" ", "_"),
            "event_cause": report.category.lower().replace(" ", "_"),
            "latitude": report.latitude,
            "longitude": report.longitude,
            "address": report.address,
            "corridor": "Unknown",
            "zone": "Unknown",
            "police_station": "Unknown",
            "priority": "High",
            "requires_road_closure": False,
            "description": report.description or "",
        }
        incident_dict, _ = create_incident(db, incident_data, reporter_id=report.reporter_id)
        report.resolved_incident_id = uuid.UUID(incident_dict["id"])

    db.commit()
    return _report_to_dict(report), incident_dict
