"""
Lightweight map matching: GPS coordinates → nearest road + intersection.
Copied verbatim from the engine ZIP.
"""
from __future__ import annotations
from typing import Optional, Tuple
import networkx as nx
from diversion_engine.models.schemas import AffectedRoadInfo
from diversion_engine.services.road_network_service import RoadNetworkService
from diversion_engine.utils.logger import get_logger

logger = get_logger(__name__)


class MapMatchingService:

    def __init__(self, road_network_service: RoadNetworkService) -> None:
        self._rns = road_network_service

    def find_nearest_road(
        self, graph: nx.MultiDiGraph, latitude: float, longitude: float
    ) -> Tuple[str, str, float]:
        nearby = self._rns.get_nearby_roads(graph, latitude, longitude, max_results=5)
        if not nearby:
            return "Unknown Road", "unknown", 0.0
        best = nearby[0]
        return best["road_name"], best["road_type"], best["distance_m"]

    def find_nearest_intersection(
        self, graph: nx.MultiDiGraph, latitude: float, longitude: float
    ) -> Tuple[int, Optional[str], float]:
        node_id, dist_m = self._rns.get_nearest_node(graph, latitude, longitude)
        node_data = graph.nodes.get(node_id, {})
        intersection_name: Optional[str] = node_data.get("name") or f"OSM node {node_id}"
        return node_id, intersection_name, dist_m

    def match_incident_to_road(self, latitude: float, longitude: float) -> AffectedRoadInfo:
        graph = self._rns.build_local_graph(latitude, longitude)
        road_name, road_type, distance_m = self.find_nearest_road(graph, latitude, longitude)
        node_id, intersection_name, _ = self.find_nearest_intersection(graph, latitude, longitude)
        return AffectedRoadInfo(
            road_name=road_name,
            distance_to_road_m=distance_m,
            nearest_intersection=intersection_name,
            road_type=road_type,
        )
