"""
Stateless business-rules service: road status classification and severity.
Copied verbatim from the engine ZIP.
"""
from __future__ import annotations
from diversion_engine.config.settings import settings
from diversion_engine.models.schemas import IncidentInput, Priority, RoadStatus, SeverityLevel
from diversion_engine.utils.logger import get_logger

logger = get_logger(__name__)


class IncidentValidationError(Exception):
    pass


class IncidentImpactService:

    def validate_incident(self, incident: IncidentInput) -> None:
        if not incident.authenticated:
            raise IncidentValidationError(
                f"Incident {incident.incident_id} is not authenticated."
            )
        if incident.status.value != "active":
            raise IncidentValidationError(
                f"Incident {incident.incident_id} has status '{incident.status.value}'. "
                "Only active incidents trigger diversion planning."
            )

    def classify_road_status(self, closure_probability: float) -> RoadStatus:
        if closure_probability >= settings.closure_threshold_high:
            return RoadStatus.CLOSED
        if closure_probability >= settings.closure_threshold_medium:
            return RoadStatus.PARTIALLY_BLOCKED
        return RoadStatus.CONGESTED

    def calculate_severity(self, road_status: RoadStatus, priority: Priority) -> SeverityLevel:
        matrix = {
            (RoadStatus.CLOSED,            Priority.HIGH):   SeverityLevel.HIGH,
            (RoadStatus.CLOSED,            Priority.MEDIUM): SeverityLevel.HIGH,
            (RoadStatus.CLOSED,            Priority.LOW):    SeverityLevel.MEDIUM,
            (RoadStatus.PARTIALLY_BLOCKED, Priority.HIGH):   SeverityLevel.HIGH,
            (RoadStatus.PARTIALLY_BLOCKED, Priority.MEDIUM): SeverityLevel.MEDIUM,
            (RoadStatus.PARTIALLY_BLOCKED, Priority.LOW):    SeverityLevel.LOW,
            (RoadStatus.CONGESTED,         Priority.HIGH):   SeverityLevel.MEDIUM,
            (RoadStatus.CONGESTED,         Priority.MEDIUM): SeverityLevel.LOW,
            (RoadStatus.CONGESTED,         Priority.LOW):    SeverityLevel.LOW,
        }
        return matrix.get((road_status, priority), SeverityLevel.MEDIUM)

    def is_diversion_required(self, road_status: RoadStatus, severity: SeverityLevel) -> bool:
        if road_status in (RoadStatus.CLOSED, RoadStatus.PARTIALLY_BLOCKED):
            return True
        return severity == SeverityLevel.HIGH
