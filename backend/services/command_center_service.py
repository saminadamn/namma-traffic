"""
Feature 6 — Executive Command Center.

Every card pulls from a REAL source — nothing here is a hardcoded
placeholder number:
  - active_incidents      -> incident_service.incident_stats(db)
  - predicted_hotspots    -> incident_service.dbscan_hotspots(db) — DBSCAN
                              clusters on live incident lat/lon; count of
                              clusters becomes the dashboard card value
  - officers_available    -> OFFICERS_TOTAL minus a real estimate driven
                              by currently-active incidents' severity
                              scores (see _estimate_allocated_officers)
  - emergency_routes_active -> incident_service.active_road_closure_count(db)
  - advisories_generated  -> len(store.ADVISORIES), grown by actually
                              generating one (see _maybe_generate_advisory)

OFFICERS_TOTAL is a plausible duty-roster size for a demo, not a real
HR/personnel-system integration — there is no such system in this repo.
"""
import logging
from datetime import datetime, timezone

from services import advisory_service, incident_service, store

logger = logging.getLogger("namma_traffic.command_center")

OFFICERS_TOTAL = 500

# Mirrors the deployment plan in the frontend resources page — officers required
# per active incident by event cause.  When an event is ended via the resources
# page its incident moves to status="completed"; those incidents are excluded
# from active_incidents, so the deployed count drops automatically.
_OFFICER_PLAN: dict[str, int] = {
    "accident":          4,
    "public_event":      8,
    "water_logging":     3,
    "vehicle_breakdown": 2,
    "tree_fall":         3,
    "construction":      5,
    "congestion":        3,
    "pot_holes":         2,
    "debris":            2,
    "signal_failure":    2,
}


def _allocated_officers(active_incidents: list[dict]) -> int:
    """Officers deployed = sum of per-cause plan across every active incident.
    Matches the Resources page so both screens always agree."""
    return sum(
        _OFFICER_PLAN.get((inc.get("event_cause") or "").lower(), 2)
        for inc in active_incidents
    )


def _maybe_generate_advisory(db) -> None:
    """Generates a new advisory only when the #1 priority incident has
    changed since the last one we generated — avoids spamming a new
    'advisory' on every dashboard refresh for the same situation."""
    top = incident_service.top_priority_incidents(db, limit=1)
    if not top:
        return
    top_incident = top[0]
    last = store.ADVISORIES[-1] if store.ADVISORIES else None
    if last and last.get("incident_id") == top_incident["id"]:
        return
    try:
        import asyncio as _asyncio
        try:
            loop = _asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop and loop.is_running():
            # Called from a FastAPI thread-pool worker — can't use asyncio.run().
            # Schedule the coroutine on the running loop and skip if it doesn't complete fast.
            import concurrent.futures
            fut = _asyncio.run_coroutine_threadsafe(
                advisory_service.generate_advisory(
                    address=top_incident["address"],
                    zone=top_incident.get("zone"),
                    severity_label=top_incident.get("severity_label") or "Medium",
                    severity_score=top_incident.get("severity_score") or 50,
                ),
                loop,
            )
            advisory = fut.result(timeout=5)
        else:
            advisory = _asyncio.run(advisory_service.generate_advisory(
                address=top_incident["address"],
                zone=top_incident.get("zone"),
                severity_label=top_incident.get("severity_label") or "Medium",
                severity_score=top_incident.get("severity_score") or 50,
            ))
        advisory["incident_id"] = top_incident["id"]
        store.ADVISORIES.append(advisory)
    except Exception as exc:
        logger.warning("Advisory generation skipped: %s", exc)


def get_summary(db) -> dict:
    _maybe_generate_advisory(db)

    stats = incident_service.incident_stats(db)
    active_incidents = incident_service.list_incidents(db, status="active", limit=500)
    allocated = _allocated_officers(active_incidents)

    return {
        "active_incidents": stats["active"],
        "predicted_hotspots": len(incident_service.dbscan_hotspots(db, limit=50)),
        "officers_available": max(0, OFFICERS_TOTAL - allocated),
        "officers_total": OFFICERS_TOTAL,
        "emergency_routes_active": incident_service.active_road_closure_count(db),
        "advisories_generated": len(store.ADVISORIES),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
