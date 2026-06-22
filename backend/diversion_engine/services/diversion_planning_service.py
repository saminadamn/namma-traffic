"""
Orchestrates the full diversion-plan generation workflow.
Copied verbatim from the engine ZIP, with the repository call replaced by
an optional callback so our router can persist back to our own DB model.
"""
from __future__ import annotations
from typing import Callable, List, Optional
import networkx as nx

from diversion_engine.config.settings import settings
from diversion_engine.models.schemas import (
    AffectedRoadInfo, DiversionPlanResponse, DiversionRoad,
    IncidentInput, Priority, RoadStatus, SeverityLevel,
)
from diversion_engine.services.incident_impact_service import (
    IncidentImpactService, IncidentValidationError,
)
from diversion_engine.services.map_matching_service import MapMatchingService
from diversion_engine.services.road_network_service import RoadNetworkService
from diversion_engine.utils.logger import get_logger

logger = get_logger(__name__)

_ROAD_TYPE_RANK: dict[str, int] = {
    "motorway": 1, "trunk": 2, "primary": 3, "secondary": 4,
    "tertiary": 5, "unclassified": 6, "residential": 7,
    "service": 8, "living_street": 9, "pedestrian": 10,
}


class DiversionPlanningService:

    def __init__(
        self,
        impact_service: IncidentImpactService,
        map_matching_service: MapMatchingService,
        road_network_service: RoadNetworkService,
        # Optional callback instead of a hard repository dependency —
        # the caller (our router) handles persistence to our own DB.
        persist_callback: Optional[Callable[[str, str, str], None]] = None,
    ) -> None:
        self._impact       = impact_service
        self._map_matching = map_matching_service
        self._rns          = road_network_service
        self._persist      = persist_callback

    def generate_diversion_plan(self, incident: IncidentInput) -> DiversionPlanResponse:
        self._impact.validate_incident(incident)

        road_status        = self._impact.classify_road_status(incident.closure_probability)
        severity           = self._impact.calculate_severity(road_status, incident.priority)
        diversion_required = self._impact.is_diversion_required(road_status, severity)

        affected_road_info = self._map_matching.match_incident_to_road(
            incident.latitude, incident.longitude
        )

        graph = self._rns.build_local_graph(incident.latitude, incident.longitude)

        # Always search for alternatives — useful even in monitor-only cases
        # so operators can see available roads before a situation escalates.
        recommended_diversions = self.find_diversion_roads(
            graph=graph,
            incident=incident,
            affected_road_name=affected_road_info.road_name,
            road_status=road_status,
            severity=severity,
        )

        # Persist computed fields back via optional callback
        if self._persist:
            self._persist(incident.incident_id, road_status.value, affected_road_info.road_name)

        message = self._build_operator_message(
            incident, affected_road_info, road_status, severity, diversion_required
        )

        return DiversionPlanResponse(
            incident_id=incident.incident_id,
            affected_road=affected_road_info.road_name,
            road_status=road_status,
            severity=severity,
            diversion_required=diversion_required,
            recommended_diversions=recommended_diversions,
            message=message,
        )

    def find_diversion_roads(
        self,
        graph: nx.MultiDiGraph,
        incident: IncidentInput,
        affected_road_name: str,
        road_status: RoadStatus,
        severity: SeverityLevel,
    ) -> List[DiversionRoad]:
        node_id, _, _ = self._map_matching.find_nearest_intersection(
            graph, incident.latitude, incident.longitude
        )
        connected  = self._rns.get_connected_roads(graph, node_id, max_hops=2)
        affected_lower = affected_road_name.lower()
        candidates = [
            r for r in connected
            if r["road_name"] != "Unnamed Road"
            and r["road_name"].lower() != affected_lower
        ]
        if not candidates:
            nearby     = self._rns.get_nearby_roads(graph, incident.latitude, incident.longitude, max_results=15)
            candidates = [
                r for r in nearby
                if r["road_name"] != "Unnamed Road"
                and r["road_name"].lower() != affected_lower
            ]
        # Last resort: include unnamed roads if nothing else found
        if not candidates:
            candidates = [r for r in connected if r["road_name"].lower() != affected_lower]
        ranked = self.rank_diversion_options(candidates, incident.latitude, incident.longitude, severity)
        return ranked[: settings.max_diversion_roads]

    def rank_diversion_options(
        self,
        candidates: List[dict],
        incident_lat: float,
        incident_lon: float,
        severity: SeverityLevel,
    ) -> List[DiversionRoad]:
        scored: List[tuple[float, dict]] = []
        for road in candidates:
            road_type = road.get("road_type", "unclassified")
            if isinstance(road_type, list):
                road_type = road_type[0]
            type_rank        = _ROAD_TYPE_RANK.get(str(road_type), 6)
            dist_m           = road.get("distance_m", 500.0)
            distance_penalty = min(dist_m / 200.0, 5.0)
            if severity == SeverityLevel.HIGH and type_rank <= 3:
                type_rank = max(1, type_rank - 1)
            scored.append((type_rank * 10 + distance_penalty, road))
        scored.sort(key=lambda x: x[0])

        result: List[DiversionRoad] = []
        seen: set = set()
        pri = 1
        for _, road in scored:
            name = road["road_name"]
            if name in seen:
                continue
            seen.add(name)
            rt = road.get("road_type", "unknown")
            if isinstance(rt, list):
                rt = rt[0]
            result.append(DiversionRoad(
                road_name=name, priority=pri, road_type=str(rt),
                distance_from_incident_m=road.get("distance_m"),
            ))
            pri += 1
        return result

    @staticmethod
    def _build_operator_message(
        incident: IncidentInput,
        affected_road: AffectedRoadInfo,
        road_status: RoadStatus,
        severity: SeverityLevel,
        diversion_required: bool,
    ) -> str:
        action = "Diversion recommended." if diversion_required else "Monitor situation — no diversion required at this time."
        return (
            f"Incident {incident.incident_id} ({incident.event_cause}) "
            f"has impacted {affected_road.road_name}. "
            f"Road status: {road_status.value}. Severity: {severity.value}. {action}"
        )
