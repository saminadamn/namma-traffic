"""
Database engine and session management.

WHY a plain synchronous SQLAlchemy engine instead of async SQLAlchemy +
asyncpg: routers/api.py already mixes sync (`def`) and async (`async def`)
handlers with no async DB boundary anywhere. Introducing an async engine
now would force every new DB-touching route to be async end-to-end while
every existing route stays sync — a confusing split to review in one PR.
Sync SQLAlchemy with a pooled connection is fast enough for the load
target in the scalability section below; revisit only if profiling shows
the DB layer (not the network or the ML inference call) is the bottleneck.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,   # avoids stale-connection errors after DB idle/restart
    pool_size=10,
    max_overflow=20,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency: one Session per request, always closed after."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
