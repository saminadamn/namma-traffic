"""
Test configuration: an isolated in-memory SQLite database per test.

RECTIFICATION (Priority 2 review): this fixture used to call
Base.metadata.create_all(engine) with no table list — fine when the only
models registered on Base.metadata were the Priority 1 auth tables,
which use SQLAlchemy's generic Uuid/JSON types and work on SQLite.

Once Priority 2's db_models/incident.py is imported anywhere in this
test's import chain (it is — main.py -> routers.api ->
services.incident_service -> db_models.incident), Incident and
CitizenReport also get registered on the SAME shared Base.metadata.
Both use a PostGIS Geography column, which has no SQLite equivalent.
An unscoped create_all() would have silently tried (and likely failed,
or worse, silently no-op'd) to create those tables too, the first time
this file ran after Priority 2 landed — breaking Priority 1's test suite
for a reason completely unrelated to anything in Priority 1's own code.

Fix: explicitly list only the auth-related tables this fixture actually
needs. Priority 2's own tests (test_incidents.py) use a separate fixture
against a real Postgres+PostGIS instance, where Geography is fully
supported — see that file's module docstring for why SQLite can't stand
in there the way it does here.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.database import Base, get_db
from db_models.user import AuditLog, Permission, RefreshToken, Role, User, role_permissions, user_roles
from routers import auth as auth_router
import main

AUTH_TABLES = [
    Role.__table__, Permission.__table__, role_permissions,
    User.__table__, user_roles, RefreshToken.__table__, AuditLog.__table__,
]

TEST_ROLE_PERMISSIONS = {
    "citizen": ["incident:create", "report:create", "report:read"],
    "field_officer": [
        "incident:create", "incident:read", "incident:verify",
        "incident:resolve", "report:read", "report:verify",
    ],
    "super_admin": ["user:list", "user:manage", "role:assign"],
}


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine, tables=AUTH_TABLES)
    TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = TestingSessionLocal()

    # Permissions are shared across roles ("incident:create" belongs to both
    # citizen and field_officer), and `permissions.code` is unique. The session
    # is autoflush=False, so querying for an existing row would not see one
    # added earlier in this same loop — build each Permission once here and
    # reuse the object instead.
    permissions: dict[str, Permission] = {}
    for role_name, perm_codes in TEST_ROLE_PERMISSIONS.items():
        role = Role(name=role_name)
        for code in perm_codes:
            perm = permissions.get(code)
            if perm is None:
                perm = permissions[code] = Permission(code=code)
                session.add(perm)
            role.permissions.append(perm)
        session.add(role)
    session.commit()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine, tables=AUTH_TABLES)


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        yield db_session

    # /api/auth/register is capped at 5/minute and /api/auth/login at
    # 10/minute. Every test here shares one client host, so the limiter keys
    # them all to the same bucket and the whole suite trips the cap partway
    # through — failures that say nothing about the auth logic under test.
    # Disable both limiters for the duration of a test; the production limits
    # themselves are unchanged.
    limiters = [main.limiter, auth_router.limiter]
    for lim in limiters:
        lim.enabled = False

    main.app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(main.app) as test_client:
            yield test_client
    finally:
        main.app.dependency_overrides.clear()
        for lim in limiters:
            lim.enabled = True
