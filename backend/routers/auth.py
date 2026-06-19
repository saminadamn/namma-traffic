"""
Authentication endpoints: register, login, refresh, logout, /me.

Mounted at /api/auth in main.py, alongside the existing predict/
incidents/reports/heatmap/analytics/weather routers. This file is
purely additive — none of the existing routers in routers/api.py change.
"""
from fastapi import APIRouter, Depends, Header, Request, Response
from typing import Optional
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

from core.database import get_db
from core.rbac import get_current_active_user
from db_models.user import User
from schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse, UserOut
from services import auth_service

router = APIRouter()


def _user_to_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id),
        phone_number=user.phone_number,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=user.role_names(),
        permissions=sorted(user.permission_codes()),
    )


@router.post("/register", response_model=UserOut, status_code=201)
@limiter.limit("5/minute")
def register(request: Request, body: RegisterRequest, db=Depends(get_db)):
    user = auth_service.register_user(db, body.phone_number, body.password, body.full_name, body.email)
    return _user_to_out(user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, db=Depends(get_db)):
    return auth_service.login(db, body.phone_number, body.email, body.password)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, db=Depends(get_db)):
    return auth_service.refresh_tokens(db, body.refresh_token)


@router.post("/logout", status_code=204, response_class=Response)
async def logout(
    body: RefreshRequest,
    db=Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    auth_service.revoke_refresh_token(db, body.refresh_token)
    # Blacklist the access token too (Redis, gracefully absent)
    if authorization and authorization.startswith("Bearer "):
        import hashlib
        from core.redis_client import blacklist_token
        from config import get_settings
        raw_token = authorization.removeprefix("Bearer ")
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()[:32]
        ttl = get_settings().access_token_expire_minutes * 60
        await blacklist_token(token_hash, ttl)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_active_user)):
    return _user_to_out(user)
