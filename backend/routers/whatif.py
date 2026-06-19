from fastapi import APIRouter, HTTPException

from schemas.features import WhatIfRequest, WhatIfResponse
from services import whatif_service

router = APIRouter()


@router.post("", response_model=WhatIfResponse)
def what_if(body: WhatIfRequest):
    try:
        return whatif_service.what_if_road_closure(body.corridor, body.closure_duration_hours)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
