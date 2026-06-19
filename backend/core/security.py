"""
Password hashing and JWT issuance/verification — pure functions, no
FastAPI or DB imports here, so this module is trivially unit-testable
and reusable from a future ARQ worker (e.g. a background job that needs
to mint a service-to-service token) without dragging in the web layer.
"""
import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from jose import jwt
from passlib.context import CryptContext

from config import get_settings

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": subject, "type": "access", "exp": expire, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str) -> tuple[str, str, datetime]:
    """Returns (raw_token, jti, expires_at). The raw token goes to the
    client; only its SHA-256 hash is ever persisted (see hash_token)."""
    jti = str(uuid.uuid4())
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {"sub": subject, "type": "refresh", "jti": jti, "exp": expire, "iat": datetime.now(timezone.utc)}
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, jti, expire


def decode_token(token: str) -> dict:
    """Raises jose.JWTError on invalid/expired tokens. Translating that
    into an HTTP 401 is the caller's job (core/rbac.py), not this
    module's — keeps this file framework-agnostic."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def hash_token(raw_token: str) -> str:
    """We never store raw refresh tokens, only a hash — same principle as
    password storage. A leaked DB then leaks no usable tokens."""
    return hashlib.sha256(raw_token.encode()).hexdigest()
