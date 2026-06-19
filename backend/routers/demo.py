from fastapi import APIRouter, Depends

from core.database import get_db
from schemas.features import DemoDataRequest, DemoDataResponse
from services import demo_data_service

router = APIRouter()


@router.post("", response_model=DemoDataResponse)
def generate(body: DemoDataRequest = DemoDataRequest(), db=Depends(get_db)):
    counts = {
        "accidents": body.accidents,
        "roadblocks": body.roadblocks,
        "congestion_spikes": body.congestion_spikes,
        "emergency_calls": body.emergency_calls,
    }
    return demo_data_service.generate_demo_data(db, counts)
