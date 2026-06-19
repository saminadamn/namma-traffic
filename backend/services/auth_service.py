"""
Business logic for registration, login, and refresh-token rotation.

Kept separate from routers/auth.py — the same separation this codebase
already uses elsewhere (services/model_service.py holds ML logic,
routers/api.py just calls into it). Routers stay thin: parse request,
call a service function, shape the response.
"""
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException

from core.security import (
    create_access_token, create_refresh_token, hash_password,
    hash_token, verify_password,
)
from db_models.user import AuditLog, RefreshToken, Role, User

logger = logging.getLogger("namma_traffic.auth")

DEFAULT_ROLE_NAME = "citizen"


def register_user(db, phone_number: str, password: str,
                   full_name: str | None, email: str | None) -> User:
    existing = db.query(User).filter(User.phone_number == phone_number).first()
    if existing:
        raise HTTPException(status_code=409, detail="Phone number already registered")

    citizen_role = db.query(Role).filter(Role.name == DEFAULT_ROLE_NAME).first()
    if citizen_role is None:
        # Fail loudly rather than silently creating a role-less,
        # permission-less user — this should only happen if migrations
        # (or the test seed fixture) haven't run yet.
        raise HTTPException(
            status_code=500,
            detail="Default role 'citizen' is not seeded. Run database migrations.",
        )

    user = User(
        phone_number=phone_number,
        password_hash=hash_password(password),
        full_name=full_name,
        email=email,
        roles=[citizen_role],
    )
    db.add(user)
    db.add(AuditLog(user_id=user.id, action="user_registered", resource="user",
                    extra={"phone_number": phone_number, "full_name": full_name}))
    db.commit()
    db.refresh(user)
    logger.info("User registered: %s (id=%s)", phone_number, user.id)
    return user


def authenticate_user(db, phone_number: str | None, email: str | None, password: str) -> User:
    if phone_number:
        user = db.query(User).filter(User.phone_number == phone_number).first()
    elif email:
        user = db.query(User).filter(User.email == email).first()
    else:
        raise HTTPException(status_code=400, detail="Provide phone_number or email")
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    return user


def _issue_token_pair(db, user: User) -> dict:
    from config import get_settings
    settings = get_settings()

    access_token = create_access_token(subject=str(user.id))
    raw_refresh, _jti, expires_at = create_refresh_token(subject=str(user.id))

    db.add(RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=expires_at,
    ))
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": raw_refresh,
        "token_type": "bearer",
        "expires_in": settings.access_token_expire_minutes * 60,
    }


def login(db, phone_number: str | None, email: str | None, password: str) -> dict:
    user = authenticate_user(db, phone_number, email, password)
    db.add(AuditLog(user_id=user.id, action="user_login", resource="session"))
    db.commit()
    logger.info("User login: %s (id=%s)", phone_number or email, user.id)
    return _issue_token_pair(db, user)


def refresh_tokens(db, raw_refresh_token: str) -> dict:
    """Rotates the refresh token on every use (one-time-use tokens).

    If a token is presented that's ALREADY marked revoked, that's a
    strong signal it was stolen and replayed — a legitimate client would
    never reuse a token it already exchanged. We respond by revoking
    every refresh token for that user, forcing re-login on all devices.

    Simplification vs. the full design doc: we revoke per-user rather
    than tracking individual token "families." That's the right scope
    for this PR; family-level tracking is a clean follow-up once there's
    a real multi-device usage pattern to design against.
    """
    token_hash = hash_token(raw_refresh_token)
    stored = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()

    if stored is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if stored.revoked:
        db.query(RefreshToken).filter(
            RefreshToken.user_id == stored.user_id,
            RefreshToken.revoked == False,  # noqa: E712 — SQLAlchemy needs `== False`, not `is False`
        ).update({"revoked": True})
        db.commit()
        raise HTTPException(
            status_code=401,
            detail="Refresh token reuse detected — all sessions revoked, please log in again",
        )

    if stored.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Refresh token expired")

    stored.revoked = True
    user = db.get(User, stored.user_id)
    db.commit()

    return _issue_token_pair(db, user)


def revoke_refresh_token(db, raw_refresh_token: str) -> None:
    token_hash = hash_token(raw_refresh_token)
    stored = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if stored:
        stored.revoked = True
        db.commit()


def assign_role(db, user_id: str, role_name: str) -> User:
    user = db.get(User, UUID(user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    role = db.query(Role).filter(Role.name == role_name).first()
    if role is None:
        raise HTTPException(status_code=404, detail=f"Role '{role_name}' does not exist")
    if role not in user.roles:
        user.roles.append(role)
        db.add(AuditLog(user_id=user.id, action="role_assigned", resource="user",
                        extra={"role": role_name}))
        db.commit()
        logger.info("Role assigned: user_id=%s role=%s", user_id, role_name)
    return user
