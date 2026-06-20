"""
Authentication + permission-check dependencies for FastAPI routes.

Usage on any router:

    from core.rbac import require_permission

    @router.patch("/{id}/verify", dependencies=[Depends(require_permission("incident:verify"))])
    def verify_incident(...): ...

PERFORMANCE NOTE (read before "optimizing" this file): require_permission
hits the database on every protected request to load the caller's
role -> permission set fresh. That is intentional and fine at current
scale. It is also the documented first target for Redis caching once
Priority 3 lands — the system design doc already specifies the cache key
shape (`perm:{user_id}`, 5 min TTL, invalidated on role change). Wiring
that in later is a one-function change inside get_current_user, not a
redesign of this module — don't pre-build the cache before Redis exists.
"""
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import decode_token
from db_models.user import User

# tokenUrl is documentation-only (drives the Swagger "Authorize" button);
# the actual route is mounted by main.py at /api/auth/login.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_error

    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_error
        user_id = payload.get("sub")
    except JWTError:
        raise credentials_error

    # Check access-token blacklist (Redis, gracefully absent)
    import hashlib
    from core.redis_client import is_blacklisted
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:32]
    if await is_blacklisted(token_hash):
        raise credentials_error

    try:
        user = db.get(User, UUID(user_id))
    except (ValueError, TypeError):
        raise credentials_error

    if user is None or not user.is_active:
        raise credentials_error
    return user


async def get_optional_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User | None:
    """Like get_current_user but returns None instead of raising when no/bad token.
    Used on endpoints that serve both anonymous and authenticated callers."""
    if token is None:
        return None
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        from uuid import UUID
        user = db.get(User, UUID(user_id))
        return user if (user and user.is_active) else None
    except Exception:
        return None


async def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Inactive user")
    return user


def require_permission(permission_code: str):
    """Dependency factory. Call with a permission code to get a dependency
    that 403s any caller who doesn't hold it — used via the `dependencies=`
    list on a route so the check runs before the handler body, and so it
    shows up in the OpenAPI schema as a documented requirement."""

    def _checker(user: User = Depends(get_current_active_user)) -> User:
        if permission_code not in user.permission_codes():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission: {permission_code}",
            )
        return user

    return _checker
