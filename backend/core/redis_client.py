"""
Optional Redis client — gracefully absent when REDIS_URL is not configured.

All callers must treat None return as "Redis unavailable" and fall back
to non-Redis behaviour. No caller should ever hard-fail on Redis being down.
"""
import logging
from typing import Optional

logger = logging.getLogger("namma_traffic.redis")

_client = None
_initialized = False


async def get_redis():
    """Returns an async Redis client, or None if Redis is not configured."""
    global _client, _initialized
    if _initialized:
        return _client
    _initialized = True
    from config import get_settings
    url = get_settings().redis_url
    if not url:
        return None
    try:
        import redis.asyncio as aioredis
        _client = aioredis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        await _client.ping()
        logger.info("Redis connected: %s", url.split("@")[-1])
    except Exception as exc:
        logger.warning("Redis unavailable (%s) — token blacklist disabled", exc)
        _client = None
    return _client


async def blacklist_token(jti_or_token_hash: str, ttl_seconds: int) -> None:
    """Add a token identifier to the blacklist. No-op if Redis is down."""
    r = await get_redis()
    if r is None:
        return
    try:
        await r.setex(f"bl:{jti_or_token_hash}", ttl_seconds, "1")
    except Exception as exc:
        logger.warning("Failed to blacklist token: %s", exc)


async def is_blacklisted(jti_or_token_hash: str) -> bool:
    """Returns True if the token is in the blacklist. Returns False if Redis is down."""
    r = await get_redis()
    if r is None:
        return False
    try:
        return await r.exists(f"bl:{jti_or_token_hash}") > 0
    except Exception as exc:
        logger.warning("Failed to check blacklist: %s", exc)
        return False


async def cache_set(key: str, value: str, ttl_seconds: int) -> None:
    """Generic cache set. No-op if Redis is down."""
    r = await get_redis()
    if r is None:
        return
    try:
        await r.setex(key, ttl_seconds, value)
    except Exception:
        pass


async def cache_get(key: str) -> Optional[str]:
    """Generic cache get. Returns None if Redis is down or key missing."""
    r = await get_redis()
    if r is None:
        return None
    try:
        return await r.get(key)
    except Exception:
        return None


async def cache_delete(key: str) -> None:
    """Delete a cached key. No-op if Redis is down."""
    r = await get_redis()
    if r is None:
        return
    try:
        await r.delete(key)
    except Exception:
        pass
