from __future__ import annotations

import math
import warnings
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional, Sequence

import pandas as pd

_BASE_SEVERITY: dict[str, float] = {
    "accident":          1.0,
    "tree_fall":         0.9,
    "construction":      0.8,
    "water_logging":     0.75,
    "road_conditions":   0.7,
    "debris":            0.7,
    "Debris":            0.7,
    "pot_holes":         0.55,
    "vehicle_breakdown": 0.5,
    "congestion":        0.4,
    "others":            0.35,
    "public_event":      0.3,
    "procession":        0.3,
    "vip_movement":      0.25,
    "protest":           0.25,
    "Fog / Low Visibility": 0.6,
    "test_demo":         0.0,
}

SEVERITY_RADIUS_M: dict[str, float] = {
    "critical": 400.0,
    "high":     200.0,
    "medium":   100.0,
    "low":       40.0,
}


@dataclass(frozen=True)
class Incident:
    id: str
    latitude: float
    longitude: float
    event_cause: str
    priority: str
    status: str
    requires_road_closure: bool
    corridor: str
    zone: Optional[str]
    start_datetime: datetime
    closed_datetime: Optional[datetime]
    severity: float = field(compare=False)

    @property
    def severity_band(self) -> str:
        if self.severity >= 0.85:
            return "critical"
        if self.severity >= 0.60:
            return "high"
        if self.severity >= 0.35:
            return "medium"
        return "low"

    @property
    def avoid_radius_m(self) -> float:
        return SEVERITY_RADIUS_M[self.severity_band]

    def is_active_at(self, query_time: datetime) -> bool:
        if self.closed_datetime is not None and query_time >= self.closed_datetime:
            return False
        return query_time >= self.start_datetime

    def __repr__(self) -> str:
        ts = self.start_datetime.strftime("%Y-%m-%d %H:%M")
        return (
            f"Incident({self.id}, cause={self.event_cause!r}, "
            f"sev={self.severity:.2f}/{self.severity_band}, "
            f"closure={self.requires_road_closure}, at {ts})"
        )


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class IncidentStore:
    def __init__(
        self,
        csv_path: str | Path,
        exclude_causes: Optional[Sequence[str]] = None,
    ) -> None:
        self._csv_path = Path(csv_path)
        self._exclude_causes: set[str] = set(exclude_causes or ["test_demo"])
        self._incidents: list[Incident] = []
        self._load()

    def _load(self) -> None:
        df = pd.read_csv(self._csv_path, low_memory=False)
        df["start_datetime"] = pd.to_datetime(df["start_datetime"], format="ISO8601", utc=True, errors="coerce")
        df["closed_datetime"] = pd.to_datetime(df["closed_datetime"], format="ISO8601", utc=True, errors="coerce")
        df["event_cause"] = df["event_cause"].fillna("others")

        n_before = len(df)
        df = df.dropna(subset=["latitude", "longitude", "start_datetime"])
        df = df[df["latitude"].between(-90, 90) & df["longitude"].between(-180, 180)]
        n_after = len(df)
        if n_before - n_after:
            warnings.warn(f"Dropped {n_before - n_after} rows with missing coords/timestamps.", stacklevel=2)

        if self._exclude_causes:
            df = df[~df["event_cause"].isin(self._exclude_causes)]

        incidents: list[Incident] = []
        for row in df.itertuples(index=False):
            severity = self._compute_severity(row)
            closed_dt = row.closed_datetime.to_pydatetime() if pd.notna(row.closed_datetime) else None
            incidents.append(Incident(
                id=str(row.id),
                latitude=float(row.latitude),
                longitude=float(row.longitude),
                event_cause=str(row.event_cause),
                priority=str(row.priority),
                status=str(row.status),
                requires_road_closure=bool(row.requires_road_closure),
                corridor=str(row.corridor),
                zone=str(row.zone) if pd.notna(row.zone) else None,
                start_datetime=row.start_datetime.to_pydatetime(),
                closed_datetime=closed_dt,
                severity=severity,
            ))
        self._incidents = incidents

    @staticmethod
    def _compute_severity(row) -> float:
        base = _BASE_SEVERITY.get(str(row.event_cause), 0.3)
        score = base
        if bool(row.requires_road_closure):
            score = min(1.0, score + 0.15)
        if str(row.priority) == "High":
            score = min(1.0, score + 0.05)
        return round(score, 3)

    def all(self) -> list[Incident]:
        return list(self._incidents)

    def active_at(self, query_time: datetime) -> list[Incident]:
        if query_time.tzinfo is None:
            query_time = query_time.replace(tzinfo=timezone.utc)
        return [i for i in self._incidents if i.is_active_at(query_time)]

    def within_radius(self, lat: float, lon: float, radius_m: float, query_time: Optional[datetime] = None) -> list[Incident]:
        pool = self.active_at(query_time) if query_time is not None else self._incidents
        return [i for i in pool if haversine_m(lat, lon, i.latitude, i.longitude) <= radius_m]

    def closures_at(self, query_time: datetime) -> list[Incident]:
        return [i for i in self.active_at(query_time) if i.requires_road_closure]

    def summary(self) -> dict:
        from collections import Counter
        causes = Counter(i.event_cause for i in self._incidents)
        statuses = Counter(i.status for i in self._incidents)
        return {
            "total_incidents": len(self._incidents),
            "by_status": dict(statuses),
            "by_cause": dict(causes),
            "road_closures": sum(1 for i in self._incidents if i.requires_road_closure),
            "date_range": {
                "earliest": min(i.start_datetime for i in self._incidents).isoformat(),
                "latest": max(i.start_datetime for i in self._incidents).isoformat(),
            },
        }

    def __len__(self) -> int:
        return len(self._incidents)

    def __repr__(self) -> str:
        return f"IncidentStore(n={len(self._incidents)}, path={self._csv_path.name!r})"
