from __future__ import annotations

import math
import warnings
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, Sequence

import networkx as nx

from .graph import add_travel_time_weights, nearest_node
from .incidents import Incident, IncidentStore, haversine_m


@dataclass
class RouterConfig:
    penalty_multiplier: float = 5.0
    closure_buffer_extra_m: float = 0.0
    fallback_on_disconnected: bool = True
    weight_attr: str = "travel_time"


@dataclass
class RouteWarning:
    code: str
    message: str


@dataclass
class RouteResult:
    origin: tuple[float, float]
    destination: tuple[float, float]
    query_time: datetime
    path_nodes: list[int]
    path_coords: list[tuple[float, float]]
    total_travel_time_s: float
    total_distance_m: float
    incidents_avoided: list[Incident]
    incidents_on_route: list[Incident]
    warnings: list[RouteWarning] = field(default_factory=list)

    def to_geojson(self) -> dict:
        return {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[lon, lat] for lat, lon in self.path_coords],
            },
            "properties": {
                "origin": list(self.origin),
                "destination": list(self.destination),
                "query_time": self.query_time.isoformat(),
                "total_travel_time_s": round(self.total_travel_time_s, 1),
                "total_distance_m": round(self.total_distance_m, 1),
                "incidents_avoided": len(self.incidents_avoided),
                "incidents_on_route": len(self.incidents_on_route),
                "warnings": [w.code for w in self.warnings],
            },
        }

    def summary(self) -> str:
        mins = self.total_travel_time_s / 60
        km   = self.total_distance_m / 1000
        lines = [
            f"Route: {self.origin} → {self.destination}",
            f"  Time   : {mins:.1f} min  |  Distance: {km:.2f} km",
            f"  Nodes  : {len(self.path_nodes)}",
            f"  Avoided: {len(self.incidents_avoided)} incident(s)",
            f"  On-route incidents: {len(self.incidents_on_route)}",
        ]
        for w in self.warnings:
            lines.append(f"  ⚠  {w.message}")
        return "\n".join(lines)


class NoRouteError(Exception):
    pass


class IncidentRouter:
    def __init__(self, G: nx.MultiDiGraph, store, config: Optional[RouterConfig] = None) -> None:
        self._G = G
        self._store = store
        self._cfg = config or RouterConfig()
        add_travel_time_weights(self._G)

    def route(
        self,
        origin: tuple[float, float],
        destination: tuple[float, float],
        query_time: Optional[datetime] = None,
    ) -> RouteResult:
        if query_time is None:
            query_time = datetime.now(tz=timezone.utc)
        elif query_time.tzinfo is None:
            query_time = query_time.replace(tzinfo=timezone.utc)

        active = self._store.active_at(query_time)
        forbidden_nodes, penalised_nodes = self._classify_nodes(active)
        incidents_on_direct = self._incidents_on_direct_path(origin, destination, active)
        route_warnings: list[RouteWarning] = []

        try:
            path = self._astar(origin, destination, forbidden_nodes=forbidden_nodes, penalised_nodes=penalised_nodes)
        except (nx.NetworkXNoPath, nx.NodeNotFound, NoRouteError):
            if not self._cfg.fallback_on_disconnected:
                raise NoRouteError(f"No incident-safe path from {origin} to {destination} at {query_time.isoformat()}.")
            route_warnings.append(RouteWarning(
                code="FALLBACK_TO_UNRESTRICTED",
                message="No safe route found; returning best available route through incident zones.",
            ))
            path = self._astar(origin, destination, forbidden_nodes=set(), penalised_nodes=set())

        path_coords = self._nodes_to_coords(path)
        travel_time, distance = self._path_cost(path)
        on_route = self._incidents_near_path(path, active)

        return RouteResult(
            origin=origin,
            destination=destination,
            query_time=query_time,
            path_nodes=path,
            path_coords=path_coords,
            total_travel_time_s=travel_time,
            total_distance_m=distance,
            incidents_avoided=incidents_on_direct,
            incidents_on_route=on_route,
            warnings=route_warnings,
        )

    def route_batch(self, pairs, query_time=None) -> list[RouteResult]:
        if query_time is None:
            query_time = datetime.now(tz=timezone.utc)
        elif query_time.tzinfo is None:
            query_time = query_time.replace(tzinfo=timezone.utc)
        return [self.route(orig, dest, query_time) for orig, dest in pairs]

    def active_incidents_near_point(self, lat, lon, radius_m=500.0, query_time=None) -> list[Incident]:
        if query_time is None:
            query_time = datetime.now(tz=timezone.utc)
        return self._store.within_radius(lat, lon, radius_m, query_time)

    def _classify_nodes(self, active):
        forbidden: set[int] = set()
        penalised: set[int] = set()
        for inc in active:
            if inc.severity == 0.0:
                continue
            extra = self._cfg.closure_buffer_extra_m if inc.requires_road_closure else 0.0
            radius = inc.avoid_radius_m + extra
            near = self._nodes_within_radius(inc.latitude, inc.longitude, radius)
            if inc.requires_road_closure:
                forbidden.update(near)
            else:
                penalised.update(near)
        penalised -= forbidden
        return forbidden, penalised

    def _nodes_within_radius(self, lat, lon, radius_m):
        result = []
        for node, data in self._G.nodes(data=True):
            nlat = data.get("y")
            nlon = data.get("x")
            if nlat is None or nlon is None:
                continue
            if haversine_m(lat, lon, nlat, nlon) <= radius_m:
                result.append(node)
        return result

    def _astar(self, origin, destination, forbidden_nodes, penalised_nodes):
        olat, olon = origin
        dlat, dlon = destination

        origin_node = nearest_node(self._G, olat, olon)
        dest_node   = nearest_node(self._G, dlat, dlon)

        if origin_node == dest_node:
            return [origin_node]

        if forbidden_nodes:
            keep = [n for n in self._G.nodes() if n not in forbidden_nodes]
            view = self._G.subgraph(keep)
        else:
            view = self._G

        if origin_node not in view or dest_node not in view:
            raise NoRouteError("Origin or destination node is in a forbidden zone.")

        cfg = self._cfg
        mult = cfg.penalty_multiplier
        wattr = cfg.weight_attr

        def weight_fn(u, v, data):
            best = min(
                d.get(wattr, 1.0) for d in data.values()
            ) if isinstance(data, dict) and data and isinstance(next(iter(data.values())), dict) else data.get(wattr, 1.0)
            if u in penalised_nodes or v in penalised_nodes:
                best *= mult
            return best

        def heuristic(u, v):
            ud = view.nodes[u]
            vd = view.nodes[v]
            dist_m = haversine_m(ud.get("y", 0.0), ud.get("x", 0.0), vd.get("y", 0.0), vd.get("x", 0.0))
            return dist_m / 50.0

        path = nx.astar_path(view, origin_node, dest_node, heuristic=heuristic, weight=weight_fn)
        return path

    def _nodes_to_coords(self, path):
        return [(self._G.nodes[n].get("y", 0.0), self._G.nodes[n].get("x", 0.0)) for n in path]

    def _path_cost(self, path):
        total_time = 0.0
        total_dist = 0.0
        for u, v in zip(path[:-1], path[1:]):
            edge_data = self._G.get_edge_data(u, v)
            if edge_data is None:
                continue
            best = min((d.get("travel_time", 999.0), d.get("length", 0.0)) for d in edge_data.values())
            total_time += best[0]
            total_dist += best[1]
        return total_time, total_dist

    def _incidents_on_direct_path(self, origin, destination, active):
        olat, olon = origin
        dlat, dlon = destination
        result = []
        for inc in active:
            if _point_to_segment_dist(inc.latitude, inc.longitude, olat, olon, dlat, dlon) <= inc.avoid_radius_m:
                result.append(inc)
        return result

    def _incidents_near_path(self, path, active):
        node_coords = [(self._G.nodes[n].get("y", 0.0), self._G.nodes[n].get("x", 0.0)) for n in path]
        on_route: list[Incident] = []
        for inc in active:
            for nlat, nlon in node_coords:
                if haversine_m(inc.latitude, inc.longitude, nlat, nlon) <= inc.avoid_radius_m:
                    on_route.append(inc)
                    break
        return on_route


def _point_to_segment_dist(plat, plon, alat, alon, blat, blon) -> float:
    cos_lat = math.cos(math.radians((alat + blat) / 2))
    m_per_deg_lat = 111_111.0
    m_per_deg_lon = 111_111.0 * cos_lat

    ax = (alon - plon) * m_per_deg_lon
    ay = (alat - plat) * m_per_deg_lat
    bx = (blon - plon) * m_per_deg_lon
    by = (blat - plat) * m_per_deg_lat

    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq < 1e-12:
        return math.hypot(ax, ay)

    t = max(0.0, min(1.0, -(ax * dx + ay * dy) / seg_len_sq))
    return math.hypot(ax + t * dx, ay + t * dy)
