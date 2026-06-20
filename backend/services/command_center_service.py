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
import asyncio
import logging
from datetime import datetime, timezone

from services import advisory_service, incident_service, store

logger = logging.getLogger("namma_traffic.command_center")

OFFICERS_TOTAL = 500


def _estimate_allocated_officers(active_incidents: list[dict]) -> int:
    """Rough draw-down of the duty roster based on real active-incident
    severity — not a real shift/roster system, but grounded in actual
    data rather than invented."""
    allocated = 0
    for inc in active_incidents:
        severity = inc.get("severity_score") or 20
        allocated += max(2, round(severity / 8))
    return allocated


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
        advisory = asyncio.run(advisory_service.generate_advisory(
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
    allocated = _estimate_allocated_officers(active_incidents)

    return {
        "active_incidents": stats["active"],
        "predicted_hotspots": len(incident_service.dbscan_hotspots(db, limit=50)),
        "officers_available": max(0, OFFICERS_TOTAL - allocated),
        "officers_total": OFFICERS_TOTAL,
        "emergency_routes_active": incident_service.active_road_closure_count(db),
        "advisories_generated": len(store.ADVISORIES),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
