"""
Integration tests for the auth/RBAC subsystem (Priority 1).

Run with:
    cd backend && pytest tests/test_auth.py -v

Uses an in-memory SQLite DB per test (see conftest.py) — no external
services required. NOTE: these tests were written and syntax-validated
but not executed in the authoring environment (no network access to
install fastapi/sqlalchemy there). Run `pytest` locally before merging.
"""


def test_register_creates_citizen_with_default_permissions(client):
    resp = client.post("/api/auth/register", json={
        "phone_number": "9876543210",
        "password": "supersecret123",
        "full_name": "Test Citizen",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["roles"] == ["citizen"]
    assert "report:create" in body["permissions"]
    assert "incident:verify" not in body["permissions"]


def test_register_duplicate_phone_rejected(client):
    payload = {"phone_number": "9876543211", "password": "supersecret123"}
    first = client.post("/api/auth/register", json=payload)
    assert first.status_code == 201
    second = client.post("/api/auth/register", json=payload)
    assert second.status_code == 409


def test_register_rejects_invalid_phone_number(client):
    resp = client.post("/api/auth/register", json={
        "phone_number": "12345",
        "password": "supersecret123",
    })
    assert resp.status_code == 422


def test_login_then_access_protected_me_route(client):
    client.post("/api/auth/register", json={"phone_number": "9876543212", "password": "supersecret123"})
    login_resp = client.post("/api/auth/login", json={"phone_number": "9876543212", "password": "supersecret123"})
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    assert "access_token" in tokens and "refresh_token" in tokens

    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["phone_number"] == "9876543212"


def test_login_wrong_password_rejected(client):
    client.post("/api/auth/register", json={"phone_number": "9876543213", "password": "supersecret123"})
    resp = client.post("/api/auth/login", json={"phone_number": "9876543213", "password": "wrongpassword"})
    assert resp.status_code == 401


def test_me_without_token_is_unauthorized(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_citizen_cannot_access_admin_user_list(client):
    client.post("/api/auth/register", json={"phone_number": "9876543214", "password": "supersecret123"})
    tokens = client.post("/api/auth/login", json={"phone_number": "9876543214", "password": "supersecret123"}).json()
    resp = client.get("/api/admin/users", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert resp.status_code == 403


def test_refresh_token_rotation_issues_new_pair(client):
    client.post("/api/auth/register", json={"phone_number": "9876543215", "password": "supersecret123"})
    tokens = client.post("/api/auth/login", json={"phone_number": "9876543215", "password": "supersecret123"}).json()

    refresh_resp = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh_resp.status_code == 200
    new_tokens = refresh_resp.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]


def test_reusing_rotated_refresh_token_is_rejected(client):
    client.post("/api/auth/register", json={"phone_number": "9876543216", "password": "supersecret123"})
    tokens = client.post("/api/auth/login", json={"phone_number": "9876543216", "password": "supersecret123"}).json()

    client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})  # rotates it
    reuse_resp = client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})  # replay
    assert reuse_resp.status_code == 401
