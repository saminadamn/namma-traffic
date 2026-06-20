"""
OSMnx-backed local road graph builder and road-query helpers.
Copied verbatim from the engine ZIP.
"""
from __future__ import annotations
from typing import Dict, List, Optional, Tuple

import networkx as nx
import osmnx as ox

from diversion_engine.config.settings import settings
from diversion_engine.utils.logger import get_logger

logger = get_logger(__name__)

ox.settings.log_console = False
ox.settings.use_cache   = True


class RoadNetworkService:

    def __init__(self) -> None:
        self._graph: Optional[nx.MultiDiGraph] = None
        self._lat:   Optional[float]           = None
        self._lon:   Optional[float]           = None

    def build_local_graph(self, latitude: float, longitude: float) -> nx.MultiDiGraph:
        if self._graph is not None and self._lat == latitude and self._lon == longitude:
            return self._graph
        try:
            graph = ox.graph_from_point(
                (latitude, longitude),
                dist=settings.graph_radius_meters,
                network_type="drive",
                simplify=True,
            )
        except Exception as exc:
            raise RuntimeError(f"Could not retrieve road network from OpenStreetMap: {exc}") from exc
        self._graph = graph
        self._lat   = latitude
        self._lon   = longitude
        logger.info("Graph built: %d nodes, %d edges.", graph.number_of_nodes(), graph.number_of_edges())
        return graph

    def get_nearby_roads(
        self, graph: nx.MultiDiGraph, latitude: float, longitude: float, max_results: int = 10
    ) -> List[Dict]:
        try:
            edges_gdf = ox.graph_to_gdfs(graph, nodes=False)
        except Exception:
            return []
        from shapely.geometry import Point
        point = Point(longitude, latitude)
        rows = []
        for idx, row in edges_gdf.iterrows():
            geom = row.get("geometry")
            if geom is None:
                continue
            dist    = geom.distance(point) * 111_320
            name    = self._extract_road_name(row)
            highway = row.get("highway", "unknown")
            if isinstance(highway, list):
                highway = highway[0]
            rows.append({"road_name": name, "road_type": str(highway),
                         "distance_m": round(dist, 1), "u": idx[0], "v": idx[1]})
        rows.sort(key=lambda r: r["distance_m"])
        return rows[:max_results]

    def get_connected_roads(
        self, graph: nx.MultiDiGraph, node_id: int, max_hops: int = 2
    ) -> List[Dict]:
        if node_id not in graph.nodes:
            return []
        visited: List[Dict] = []
        seen: set = set()
        frontier = {node_id}
        for _ in range(max_hops):
            nxt: set = set()
            for n in frontier:
                for _, neighbour, data in graph.edges(n, data=True):
                    name = self._extract_road_name(data)
                    if name not in seen:
                        seen.add(name)
                        hw = data.get("highway", "unknown")
                        if isinstance(hw, list):
                            hw = hw[0]
                        visited.append({"road_name": name, "road_type": str(hw),
                                        "u": n, "v": neighbour})
                    nxt.add(neighbour)
            frontier = nxt
        return visited

    def get_nearest_node(self, graph: nx.MultiDiGraph, latitude: float, longitude: float) -> Tuple[int, float]:
        node_id, dist = ox.nearest_nodes(graph, longitude, latitude, return_dist=True)
        return int(node_id), round(float(dist), 1)

    @staticmethod
    def _extract_road_name(data: Dict) -> str:
        import math

        def _valid(v) -> bool:
            if v is None:
                return False
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                return False
            s = str(v).strip()
            return bool(s) and s.lower() not in ("nan", "none", "")

        raw = data.get("name")
        if isinstance(raw, list):
            raw = next((x for x in raw if _valid(x)), None)
        if not _valid(raw):
            raw = data.get("ref")
            if isinstance(raw, list):
                raw = next((x for x in raw if _valid(x)), None)
        return str(raw).strip() if _valid(raw) else "Unnamed Road"
