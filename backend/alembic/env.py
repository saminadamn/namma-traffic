"""
Alembic environment script.

Overrides the sqlalchemy.url from alembic.ini with the live DATABASE_URL
from config.get_settings(), so there's exactly one place (.env) that
defines the database connection — not two (alembic.ini AND .env) that
can silently drift out of sync.
"""
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# This file runs via the standalone `alembic` CLI, which does not
# automatically put the project root on sys.path the way `uvicorn
# main:app` (run from inside backend/) does. Add it explicitly so
# `from config import get_settings` and `from core.database import Base`
# resolve the same way they do everywhere else in this codebase.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import get_settings           # noqa: E402
from core.database import Base            # noqa: E402
from db_models import user, incident      # noqa: E402,F401 — registers models on Base.metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
