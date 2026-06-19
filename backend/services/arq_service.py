"""
ARQ job-queue helpers.

Callers never need to know whether Redis is configured — every function
silently no-ops when it isn't.  This keeps the main request path clean:
    await arq_service.enqueue("geocode_report", report_id)
...and if there's no Redis, the report just keeps its original address.
"""
import logging
from typing import Any

logger = logging.getLogger("namma_traffic.arq")

_pool = None
_pool_initialized = False


async def _get_pool():
    global _pool, _pool_initialized
    if _pool_initialized:
        return _pool
    _pool_initialized = True

    from config import get_settings
    url = get_settings().redis_url
    if not url:
        return None
    try:
        from arq import create_pool
        from arq.connections import RedisSettings
        _pool = await create_pool(RedisSettings.from_dsn(url))
        logger.info("ARQ pool connected")
    except Exception as exc:
        logger.warning("ARQ pool unavailable (%s) — background jobs disabled", exc)
        _pool = None
    return _pool


async def enqueue(job_name: str, *args: Any) -> None:
    """Enqueue a named job. No-op if Redis is not configured or unreachable."""
    pool = await _get_pool()
    if pool is None:
        return
    try:
        await pool.enqueue_job(job_name, *args)
        logger.debug("Enqueued %s args=%s", job_name, args)
    except Exception as exc:
        logger.warning("Failed to enqueue %s: %s", job_name, exc)
