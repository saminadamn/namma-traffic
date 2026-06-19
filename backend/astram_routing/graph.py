from __future__ import annotations

import math
import warnings
from pathlib import Path
from typing import Literal, Optional, Union

import networkx as nx

BBOX_NORTH = 13.27
BBOX_SOUTH = 12.80
BBOX_EAST  = 77.77
BBOX_WEST  = 77.30

DEFAULT_SPEED_KMH = 30.0

BackendType = Literal["osmnx", "graphml", "synthetic"]


def load_graph(
    backend: BackendType = "osmnx",
    *,
    cache_path: Union[str, Path, None] = None,
    graphml_path: Union[str, Path, None] = None,
    osmnx_dist_from_point: Optional[tuple[float, float, float]] = None,
    osmnx_bbox: Optional[tuple[float, float, float, float]] = None,
) -> nx.MultiDiGraph:
    if backend == "osmnx":
        G = _load_osmnx(cache_path, osmnx_dist_from_point, osmnx_bbox)
    elif backend == "graphml":
        if graphml_path is None:
            raise ValueError("graphml_path must be provided when backend='graphml'")
        G = _load_graphml(Path(graphml_path))
    elif backend == "synthetic":
        G = _build_synthetic()
    else:
        raise ValueError(f"Unknown backend: {backend!r}")

    add_travel_time_weights(G)
    return G


def _load_osmnx(cache_path, dist_from_point, bbox) -> nx.MultiDiGraph:
    try:
        import osmnx as ox
    except ImportError as e:
        raise ImportError("osmnx is required for backend='osmnx'. Install it with: pip install osmnx") from e

    cache_file = Path(cache_path) if cache_path else Path("cache/bengaluru_drive.graphml")
    cache_file.parent.mkdir(parents=True, exist_ok=True)

    if cache_file.exists():
        return ox.load_graphml(cache_file)

    _ver = tuple(int(x) for x in ox.__version__.split(".")[:2])

    if dist_from_point is not None:
        lat, lon, dist = dist_from_point
        if _ver >= (2, 0):
            G = ox.graph_from_point((lat, lon), dist=dist, network_type="drive")
        else:
            G = ox.graph_from_point((lat, lon), dist=dist, network_type="drive", simplify=True)
    else:
        north, south, east, west = bbox or (BBOX_NORTH, BBOX_SOUTH, BBOX_EAST, BBOX_WEST)
        if _ver >= (2, 0):
            # osmnx 2.x bbox order: (left, bottom, right, top) = (west, south, east, north)
            G = ox.graph_from_bbox((west, south, east, north), network_type="drive")
        else:
            G = ox.graph_from_bbox(bbox=(north, south, east, west), network_type="drive", simplify=True)

    G = ox.add_edge_speeds(G)
    G = ox.add_edge_travel_times(G)
    ox.save_graphml(G, cache_file)
    return G


def _load_graphml(path: Path) -> nx.MultiDiGraph:
    G = nx.read_graphml(path, node_type=int)
    return nx.MultiDiGraph(G)


def _build_synthetic(n_lat: int = 55, n_lon: int = 55, spacing_m: float = 900.0) -> nx.MultiDiGraph:
    G = nx.MultiDiGraph()

    dlat = spacing_m / 111_111.0
    dlon = spacing_m / (111_111.0 * math.cos(math.radians((BBOX_NORTH + BBOX_SOUTH) / 2)))

    lat_vals = [BBOX_SOUTH + i * dlat for i in range(n_lat) if BBOX_SOUTH + i * dlat <= BBOX_NORTH]
    lon_vals = [BBOX_WEST  + j * dlon for j in range(n_lon) if BBOX_WEST  + j * dlon <= BBOX_EAST]

    node_id = 0
    grid: dict[tuple[int, int], int] = {}
    for i, lat in enumerate(lat_vals):
        for j, lon in enumerate(lon_vals):
            G.add_node(node_id, y=lat, x=lon, street_count=4)
            grid[(i, j)] = node_id
            node_id += 1

    def _hav(lat1, lon1, lat2, lon2) -> float:
        R = 6_371_000.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    for (i, j), u in grid.items():
        for di, dj in [(0, 1), (1, 0)]:
            ni, nj = i + di, j + dj
            if (ni, nj) in grid:
                v = grid[(ni, nj)]
                ulat, ulon = lat_vals[i], lon_vals[j]
                vlat, vlon = lat_vals[ni], lon_vals[nj]
                length = _hav(ulat, ulon, vlat, vlon)
                for src, dst in [(u, v), (v, u)]:
                    G.add_edge(src, dst, key=0, length=length, highway="residential", name="")

    G.graph["crs"] = "epsg:4326"
    return G


def add_travel_time_weights(G: nx.MultiDiGraph) -> None:
    for u, v, k, data in G.edges(data=True, keys=True):
        if "travel_time" not in data or data["travel_time"] is None:
            length = data.get("length", 50.0)
            speed_ms = data.get("speed_kph", DEFAULT_SPEED_KMH) / 3.6
            data["travel_time"] = length / max(speed_ms, 0.1)


def nearest_node(G: nx.MultiDiGraph, lat: float, lon: float) -> int:
    best_node: Optional[int] = None
    best_dist = float("inf")
    for node, data in G.nodes(data=True):
        nlat = data.get("y")
        nlon = data.get("x")
        if nlat is None or nlon is None:
            continue
        d = (nlat - lat) ** 2 + (nlon - lon) ** 2
        if d < best_dist:
            best_dist = d
            best_node = node
    if best_node is None:
        raise ValueError("Graph has no nodes with (y, x) coordinates.")
    return best_node
