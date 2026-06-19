from fastapi import APIRouter, Depends

from core.database import get_db
from schemas.features import CommandCenterResponse
from services import command_center_service

router = APIRouter()


@router.get("/summary", response_model=CommandCenterResponse)
def summary(db=Depends(get_db)):
    return command_center_service.get_summary(db)
