"""
Integration tests for incident/report management (Priority 2).

UNLIKE tests/test_auth.py, these tests require a REAL PostgreSQL database
with the PostGIS extension. There is no portable cross-dialect type for
`Geography` the way there was for `Uuid`/`JSON` in Priority 1 — SQLite has
no spatial type to stand in. That's a deliberate, documented scope
difference from test_auth.py, not an oversight (see tests/conftest.py's
docstring for the related bug this distinction prevented).

Run with a disposable test database:
    export TEST_DATABASE_URL=postgresql://namma:namma@localhost:5432/namma_traffic_test
    cd backend && pytest tests/test_incidents.py -v

If TEST_DATABASE_URL is unset, every test here is skipped (not failed) —
this suite is meant to run in a CI pipeline that provisions a
Postgres+PostGIS service container, not in a plain `pytest tests/` run
with no database available, which is exactly the situation this file was
authored under (no network access to install Postgres in that sandbox).
"""
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from core.database import Base, get_db
import main

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="TEST_DATABASE_URL not set — these tests need real Postgres+PostGIS, see module docstring",
)


@pytest.fixture()
def db_session():
    engine = create_engine(TEST_DATABASE_URL)
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        conn.commit()
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        yield db_session

    main.app.dependency_overrides[get_db] = _override_get_db
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.clear()


def test_create_incident_returns_expected_shape(client):
    resp = client.post("/api/incidents", json={
        "event_type": "accident", "event_cause": "accident",
        "latitude": 12.97, "longitude": 77.59, "address": "Test Junction",
        "corridor": "Test Road", "zone": "Test Zone", "police_station": "Test PS",
        "priority": "High", "requires_road_closure": True, "description": "test",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "active"
    assert body["latitude"] == 12.97


def test_duplicate_incident_within_radius_bumps_confirmation_not_new_row(client):
    payload = {
        "event_type": "water_logging", "event_cause": "water_logging",
        "latitude": 13.01, "longitude": 77.59, "address": "Nagavara",
        "corridor": "ORR", "zone": "North", "police_station": "Hebbal",
        "priority": "High", "requires_road_closure": False, "description": "flooded",
    }
    first = client.post("/api/incidents", json=payload).json()
    # ~50m away — inside the 150m dedup radius — submitted moments later
    nearby_payload = {**payload, "latitude": 13.0105, "longitude": 77.5905}
    second = client.post("/api/incidents", json=nearby_payload).json()
    assert second["id"] == first["id"]  # matched, not a new row

    stats = client.get("/api/incidents/stats").json()
    assert stats["total"] == 1


def test_report_then_approve_creates_linked_incident(client):
    report_resp = client.post("/api/reports", data={
        "category": "Pothole", "description": "deep pothole", "address": "MG Road",
        "latitude": "12.97", "longitude": "77.61",
    })
    assert report_resp.status_code == 200
    tracking_id = report_resp.json()["tracking_id"]

    reports = client.get("/api/reports?status=pending").json()
    report_id = next(r["id"] for r in reports if r["tracking_id"] == tracking_id)

    verify_resp = client.patch("/api/reports/verify", json={"report_id": report_id, "action": "approve"})
    assert verify_resp.status_code == 200
    assert verify_resp.json()["message"] == "Report approved"  # "approve" was never the broken case — "reject" was, see test below

    incidents = client.get("/api/incidents").json()
    assert any(i["address"] == "MG Road" for i in incidents)


def test_reject_message_is_spelled_correctly(client):
    """Regression test for the pre-existing 'Report rejectd' typo bug
    fixed in services/incident_service.py's ACTION_PAST_TENSE mapping."""
    report_resp = client.post("/api/reports", data={
        "category": "Signal failure", "description": "broken signal", "address": "KR Circle",
        "latitude": "12.97", "longitude": "77.57",
    })
    tracking_id = report_resp.json()["tracking_id"]
    reports = client.get("/api/reports?status=pending").json()
    report_id = next(r["id"] for r in reports if r["tracking_id"] == tracking_id)

    verify_resp = client.patch("/api/reports/verify", json={"report_id": report_id, "action": "reject"})
    assert verify_resp.json()["message"] == "Report rejected"


def test_verify_with_malformed_report_id_returns_400_not_500(client):
    resp = client.patch("/api/reports/verify", json={"report_id": "not-a-real-uuid", "action": "approve"})
    assert resp.status_code == 400


def test_websocket_receives_broadcast_on_new_incident(client):
    with client.websocket_connect("/ws/incidents") as websocket:
        client.post("/api/incidents", json={
            "event_type": "tree_fall", "event_cause": "tree_fall",
            "latitude": 12.93, "longitude": 77.62, "address": "Test Fall Site",
            "corridor": "Test", "zone": "Test", "police_station": "Test",
            "priority": "Low", "requires_road_closure": False, "description": "",
        })
        message = websocket.receive_json()
        assert message["type"] == "incident_created"
        assert message["data"]["address"] == "Test Fall Site"


def test_websocket_bbox_filter_excludes_incidents_outside_viewport(client):
    # Viewport covering only central Bengaluru — Hebbal (13.03) is outside it.
    with client.websocket_connect(
        "/ws/incidents?minLat=12.90&minLon=77.55&maxLat=12.99&maxLon=77.65"
    ) as websocket:
        client.post("/api/incidents", json={
            "event_type": "accident", "event_cause": "accident",
            "latitude": 13.0358, "longitude": 77.5970, "address": "Hebbal Flyover (outside viewport)",
            "corridor": "ORR", "zone": "North", "police_station": "Hebbal",
            "priority": "High", "requires_road_closure": False, "description": "",
        })
        client.post("/api/incidents", json={
            "event_type": "accident", "event_cause": "accident",
            "latitude": 12.9767, "longitude": 77.5713, "address": "KR Circle (inside viewport)",
            "corridor": "Mysore Road", "zone": "Central", "police_station": "Cubbon Park",
            "priority": "High", "requires_road_closure": False, "description": "",
        })
        message = websocket.receive_json()  # should be the KR Circle one, not Hebbal
        assert message["data"]["address"] == "KR Circle (inside viewport)"
