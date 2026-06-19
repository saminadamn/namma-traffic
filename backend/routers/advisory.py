from fastapi import APIRouter
from pydantic import BaseModel
from services import advisory_service

router = APIRouter()


class AdvisoryRequest(BaseModel):
    address: str
    zone: str = ""
    severity_label: str = "Medium"
    severity_score: int = 50
    event_type: str = "incident"


@router.post("")
async def generate(body: AdvisoryRequest):
    return await advisory_service.generate_advisory(
        address=body.address,
        zone=body.zone,
        severity_label=body.severity_label,
        severity_score=body.severity_score,
        event_type=body.event_type,
    )
