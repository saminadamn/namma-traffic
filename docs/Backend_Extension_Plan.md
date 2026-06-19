# Namma Traffic — Incremental Backend Extension Plan
### Staff Engineer Review · Priority 1 Shipped This PR · Priorities 2–7 Scoped

---

## ⚠️ One correction before anything else

**BullMQ does not exist for Python.** It's a Node.js/TypeScript library built on top of `ioredis`. Your backend is FastAPI (Python), so "Redis + BullMQ" as stated in the brief isn't an available combination — using it would mean either running a second Node.js service just to own queues (real architectural overhead for no clear benefit here) or misapplying the name to something else and confusing every future reader of this doc.

**Substitution used throughout this plan: ARQ.** It's async-native, Redis-backed, and built specifically for asyncio applications like FastAPI — closer in spirit to BullMQ than Celery is (Celery is sync-first and heavier). Celery remains the right call if you later need complex workflow chaining or multiple language workers; ARQ is the right call for "FastAPI background jobs on Redis," which is what every job in this plan actually is.

---

## STEP 1 — Existing Codebase Analysis

### Current architecture (as it actually is, not as documented)

```
backend/
├── main.py                  → FastAPI app, CORS, lifespan loads ModelService, mounts 6 routers
├── config.py                → pydantic-settings, env-driven, single Settings class
├── routers/
│   └── api.py                → ALL 6 routers in one file: predict, incidents, reports, heatmap, analytics, weather
├── services/
│   ├── model_service.py      → LightGBM+XGBoost ensemble with a hand-coded fallback heuristic
│   └── store.py               → Python list/dict "database" — INCIDENTS, REPORTS, PREDICTIONS as module-level globals
├── schemas/
│   └── schemas.py             → all Pydantic models in one file
└── models/                    → ML artifact storage (lgbm_model.pkl etc.) — empty except .gitkeep; no trained models actually shipped
```

### What each piece does
| Module | Responsibility | Notable detail |
|---|---|---|
| `main.py` | App wiring only | `lifespan` loads `ModelService` once at startup into `app.state` — correct pattern, not touched |
| `routers/api.py` | 6 routers as plain functions | No auth, no validation beyond Pydantic, no rate limiting |
| `services/store.py` | "Database" | **In-memory Python lists.** Data resets on every restart. Pre-seeded with 5 incidents + 3 reports for demo realism |
| `services/model_service.py` | Prediction | Tries to load 3 pkl files; **none exist** (`models/` is empty), so it silently runs `_fallback()`, a hand-written heuristic scorer, in production right now |
| `schemas/schemas.py` | Request/response shapes | Clean, uses `Literal` types well — no debt here |

### Dependency graph
```
main.py
 ├── routers/api.py
 │     ├── schemas/schemas.py        (EventInput, PredictionOutput, IncidentCreate, VerifyAction)
 │     ├── services/store.py          (INCIDENTS, REPORTS, PREDICTIONS lists)
 │     └── config.py                  (get_settings — used only by weather_router)
 └── services/model_service.py
       └── config.py                  (model_path, xgb_model_path, tfidf_path)
```
Flat, two-level, no circular imports, no hidden coupling. **This is genuinely clean for what it is** — the technical debt is in what's missing, not in what's there being wrong.

### Identified technical debt
1. **`services/store.py` is not a database.** Every incident/report vanishes on restart. This is the single biggest gap versus "production-grade."
2. **`model_service.py` is running its fallback heuristic in production**, not the LightGBM/XGBoost ensemble the code implies — the pkl files referenced in `config.py` don't exist in the repo. The README should say this explicitly; right now it's a silent fallback that looks like a working ML model from the outside.
3. **`CORRIDOR_HISTORY` / `ZONE_HISTORY` / `EVENT_TYPE_HISTORY` are hard-coded Python dicts** inside `model_service.py`, standing in for what should be aggregated queries over real historical data. Fine for a demo; a real gap versus the target architecture's TimescaleDB feature pipeline.
4. **No auth anywhere.** Every route, including `verify` (which should be officer-only) and `analytics/summary`, is open to the public internet.
5. **CORS is `allow_origins=["*"]`** — fine for a hackathon demo, a real problem the moment auth cookies or credentials matter.
6. **No tests existed before this PR.**

### What should NOT be changed
- `services/model_service.py`'s prediction logic and SHAP-explanation shape — the frontend's `/authority/predict` page is built against this exact response contract (`risk_score`, `shap_features`, `reasoning`). Changing it breaks the UI for no Priority-1 benefit.
- `routers/api.py`'s six existing routers — untouched in this PR, see diffs below (only `main.py` gained two new `include_router` lines).
- The flat import style (`from config import get_settings`, not `from backend.config import ...`) — every new file in this PR follows it for consistency, even though `from . import` would be more "standard" in a deeper package.
- `services/store.py` itself — Priority 2 migrates incidents/reports to Postgres; doing it now would have doubled this PR's blast radius for no Priority-1 benefit.

---

## STEP 2 — Gap Analysis vs. Target Architecture

| Missing feature | Difficulty | Est. time | Dependencies | DB changes | API changes |
|---|---|---|---|---|---|
| PostgreSQL + RBAC + JWT (Priority 1) | Medium | 3–4 days | None — foundational | New: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `refresh_tokens`, `audit_logs` | New `/api/auth/*`, `/api/admin/*` routers |
| Migrate incidents/reports to Postgres (Priority 2) | Medium | 2–3 days | Priority 1 (need `users.id` for `reporter_id` FK) | New: `incidents`, `incident_types`, `citizen_reports` tables; PostGIS extension | Modify `routers/api.py` incident/report handlers to query DB instead of `store.py` lists |
| WebSockets + real-time push | Medium | 2 days | Priority 2 (need DB change-events to broadcast) | None | New `/ws/incidents` route in a new `routers/websocket.py` |
| Redis + ARQ background jobs | Medium | 2 days | None, but more useful after Priority 2 exists | None | New `/api/admin/jobs/status` for queue monitoring |
| Traffic prediction engine (real, DB-backed) | Hard | 5–7 days | Priority 2 (needs real historical data to train on, not hard-coded dicts) | New: `road_segments`, `segment_speed_observations` (TimescaleDB hypertable), `congestion_predictions` | New `/api/congestion/*` routes |
| Emergency vehicle routing | Hard | 4–5 days | Prediction engine (needs live edge weights) | New: `emergency_dispatch_requests`, `vehicle_tracking` | New `/api/emergency/*` + WS tracking channel |
| Multilingual LLM advisory (Gemini) | Medium | 2–3 days | Priority 2 (needs real incident/congestion data to ground responses in) | New: `advisory_cache`, `advisory_feedback` | New `/api/advisory/*` |
| Dashboard analytics APIs | Easy–Medium | 1–2 days | Priority 2 (real data, not the hard-coded `summary()` currently returned) | None new — queries existing tables | Modify `analytics_router.summary()` to query DB |

---

## STEP 3 — Prioritized Implementation Order (confirmed, with one dependency note)

The order you specified is correct and is what's followed below, with one adjustment worth flagging: **traffic prediction (Priority 4) genuinely cannot improve on the current hard-coded-dict fallback until Priority 2's real incident data exists to train on.** Build Priority 4's *API shape and serving infrastructure* in its slot, but expect the model itself to stay heuristic until there's real data volume — say this explicitly in your SIH pitch rather than letting a judge discover it.

---

## STEP 4 — Generated Code: Priority 1 (Shipped in Full This PR)

### Design decisions, explained

**Why a brand-new `core/` and `db_models/` folder instead of dropping files into `services/`?** `services/` currently means "business logic that operates on data" (model_service, store). Database session management (`core/database.py`) and security primitives (`core/security.py`, `core/rbac.py`) are infrastructure, not business logic — a different layer, so they get a different folder. This is the one new top-level concept introduced in this PR, and it's introduced because the alternative (cramming JWT logic into `services/`) would blur a distinction worth keeping.

**Why `db_models/` and not `models/`?** `models/` already means "serialized ML artifacts" in this codebase (`config.py:model_path`). Reusing it for SQLAlchemy ORM classes creates exactly the kind of naming collision that causes a confusing PR review six months from now. See the full reasoning in `db_models/user.py`'s module docstring.

**Why SQLAlchemy's generic `Uuid`/`JSON` types instead of `postgresql.UUID`/`postgresql.JSONB`?** They behave identically on Postgres in production, but they *also* work on SQLite — which is what makes `tests/test_auth.py` runnable with zero external services. This was a deliberate trade against slightly more Postgres-native typing, made specifically so the test suite has no infrastructure dependency.

**Why is the audit log column named `extra`, not `metadata`?** SQLAlchemy's declarative `Base` reserves `metadata` as a class attribute (the schema registry). A column named `metadata` shadows it and throws `InvalidRequestError` at import time — a well-known trap, sidestepped by naming the column something else rather than fighting the framework.

**Why query the DB for permissions on every request instead of caching now?** Because Redis doesn't exist yet in this codebase — that's Priority 3. Building a cache for a Redis cluster that isn't wired up yet would be premature; `core/rbac.py` has a comment marking exactly where that cache slots in once Priority 3 ships, so it's a one-function change later, not a redesign.

### Folder structure — only new/changed entries shown

```
backend/
├── core/                          [NEW]
│   ├── __init__.py
│   ├── database.py                  SQLAlchemy engine, SessionLocal, Base, get_db
│   ├── security.py                  password hashing, JWT encode/decode
│   └── rbac.py                      get_current_user, require_permission()
├── db_models/                     [NEW]
│   ├── __init__.py
│   └── user.py                      User, Role, Permission, RefreshToken, AuditLog
├── alembic/                       [NEW]
│   ├── env.py
│   ├── script.py.mako
│   └── versions/0001_create_auth_tables.py
├── alembic.ini                    [NEW]
├── tests/                         [NEW]
│   ├── __init__.py
│   ├── conftest.py                  SQLite fixtures, no Postgres needed for unit tests
│   └── test_auth.py                  9 tests covering register/login/RBAC/refresh rotation
├── routers/
│   ├── api.py                       UNCHANGED
│   ├── auth.py                    [NEW] /register /login /refresh /logout /me
│   └── admin.py                   [NEW] /users /roles /users/{id}/roles
├── schemas/
│   ├── schemas.py                   UNCHANGED
│   └── auth.py                    [NEW] RegisterRequest, LoginRequest, TokenResponse, UserOut, ...
├── services/
│   ├── store.py                     UNCHANGED
│   ├── model_service.py             UNCHANGED
│   └── auth_service.py            [NEW] register/login/refresh-rotation business logic
├── config.py                      [MODIFIED — 6 new settings fields appended, nothing removed]
├── main.py                        [MODIFIED — 2 new router includes, nothing removed]
├── requirements.txt               [MODIFIED — 7 new deps appended, nothing removed/changed]
└── .env.example                  [NEW]
```

### Files created (full code, already written into the project)
`core/database.py` · `core/security.py` · `core/rbac.py` · `db_models/user.py` · `schemas/auth.py` · `services/auth_service.py` · `routers/auth.py` · `routers/admin.py` · `alembic.ini` · `alembic/env.py` · `alembic/script.py.mako` · `alembic/versions/0001_create_auth_tables.py` · `tests/conftest.py` · `tests/test_auth.py` · `.env.example`

### Files modified (exact diffs)

**`config.py`** — appended inside the existing `Settings` class, nothing removed:
```python
    # ── Added for Priority 1 (RBAC / auth) — see core/database.py, core/security.py ──
    database_url: str = "postgresql://namma:namma@localhost:5432/namma_traffic"
    jwt_secret_key: str = "dev-only-secret-CHANGE-ME-with-openssl-rand-hex-32"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
```

**`main.py`** — one import line extended, two `include_router` calls added:
```python
from routers import api, auth, admin     # was: from routers import api
...
app.include_router(auth.router,  prefix="/api/auth",  tags=["Auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
```

**`requirements.txt`** — 7 lines appended:
```
sqlalchemy==2.0.30
alembic==1.13.1
psycopg2-binary==2.9.9
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
bcrypt==4.0.1          # pinned: passlib 1.7.4 breaks on bcrypt>=4.1, see comment in file
pytest==8.2.2
```

### API surface added

| Method | Endpoint | Auth required | Description |
|---|---|---|---|
| POST | `/api/auth/register` | None | Citizen self-registration |
| POST | `/api/auth/login` | None | Returns access + refresh token pair |
| POST | `/api/auth/refresh` | Valid refresh token | Rotates token, detects reuse |
| POST | `/api/auth/logout` | Valid refresh token | Revokes it |
| GET | `/api/auth/me` | Access token | Current user + roles + permissions |
| GET | `/api/admin/users` | `user:list` permission | Paginated user list |
| GET | `/api/admin/roles` | `user:list` permission | List all roles |
| POST | `/api/admin/users/{id}/roles` | `role:assign` permission | Grant a role |

### Verification performed

Every new and existing `.py` file was syntax-checked with `python -m py_compile` — **all 24 files pass.** I could not execute `pytest` against a live database in the environment this was authored in (no network access to install FastAPI/SQLAlchemy/Postgres there) — **run the test suite locally before merging**:
```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

### How to apply the migration

```bash
cd backend
# Point DATABASE_URL at a real Postgres instance first (.env, copied from .env.example)
alembic upgrade head
```

---

## STEP 4 (continued) — Design Specs for Priorities 2–7

### Priority 2 — Incident Management + WebSockets + Real-Time Notifications — SHIPPED IN FULL

**Design decisions, explained:**

Every incident/report point is stored twice: once as a PostGIS `Geography` column (`location`, for accurate radius queries) and once as plain `latitude`/`longitude` floats (for cheap JSON serialization matching the existing frontend contract exactly). This denormalization is deliberate — see `db_models/incident.py`'s module docstring for the full reasoning.

Bounding-box ("what's in my map viewport") queries use plain float range filters on `latitude`/`longitude`, not PostGIS `ST_MakeEnvelope`. A map viewport is an axis-aligned rectangle with no antimeridian edge case for a Bengaluru-only deployment — the simpler query is also the more obviously correct one. PostGIS geography functions (`ST_DWithin`) are reserved for radius search and dedup-check, where meter-accurate circular distance genuinely matters.

`Incident.event_cause` stays a plain string, not a hard foreign key into the new `incident_types` reference table — the existing frontend already sends free-form category strings, and a hard FK would reject the first unlisted value submitted in production.

RBAC enforcement was deliberately **not** added to the citizen-facing incident/report routes or the officer `verify` route in this PR, even though `core/rbac.py`'s `require_permission()` is ready and the permission codes (`incident:create`, `report:verify`, etc.) already exist from Priority 1. The current frontend has zero login UI — hard-enforcing auth now would silently break the working citizen-report → officer-verify → live-map demo loop with no way for anyone to authenticate through it. This is flagged as an intentional, coordinated frontend+backend follow-up, not an oversight.

**Folder structure — new/changed entries only:**
```
backend/
├── db_models/
│   └── incident.py                [NEW] IncidentType, Incident, CitizenReport
├── services/
│   └── incident_service.py        [NEW] DB-backed CRUD, dedup, verify-and-link logic
├── routers/
│   ├── websocket.py                [NEW] ConnectionManager + /ws/incidents route
│   └── api.py                      [MODIFIED] incidents_router/reports_router/heatmap_router migrated off store.py
├── alembic/versions/
│   └── 0002_create_incident_tables.py   [NEW]
├── tests/
│   └── test_incidents.py           [NEW] 7 tests, requires real Postgres+PostGIS (see file docstring)
├── main.py                        [MODIFIED — 1 import extended, websocket router mounted]
├── requirements.txt               [MODIFIED — GeoAlchemy2 added]
```
`services/store.py`, `services/model_service.py`, `predict_router`, `analytics_router`, `weather_router`, and `hotspots()` are byte-for-byte unchanged.

**API surface added:** `GET /api/incidents/bbox`, `WS /ws/incidents?minLat=&minLon=&maxLat=&maxLon=` (broadcasts `{"type": "incident_created"|"incident_confirmed", "data": {...}}`, viewport-filtered if bbox params are supplied).

#### Error rectification log (3 issues found and fixed during this priority)

1. **Pre-existing bug, now fixed:** the original `routers/api.py` verify endpoint built its response message as `f"Report {action.action}d"`. That's correct for `"approve"` → `"approved"`, but produces **`"Report rejectd"`** for `"reject"` — a real, shipped typo (missing the 'e'). Fixed with an explicit `ACTION_PAST_TENSE` mapping in `services/incident_service.py`. Covered by a regression test: `tests/test_incidents.py::test_reject_message_is_spelled_correctly`.

2. **Bug that would have shipped silently, caught in review:** `heatmap_router.heatmap()` read `store.INCIDENTS` directly. Migrating `incidents_router` to Postgres without also touching `heatmap()` would have left it reading a list that's never written to again — the heatmap would have silently and permanently returned `{"points": [], "total": 0}`, with no error anywhere to point at why. Fixed by migrating `heatmap()` to query the same `incident_service.list_incidents()` function. `hotspots()` was correctly left untouched — it's independent hardcoded demo data, not coupled to `store.INCIDENTS`.

3. **Bug that would have broken Priority 1's own test suite, caught in review:** `tests/conftest.py`'s SQLite fixture called unscoped `Base.metadata.create_all(engine)`. That was fine when only Priority 1's auth tables were registered on `Base.metadata`. Once `db_models/incident.py` (PostGIS `Geography` columns, no SQLite equivalent) gets imported via `main.py → routers.api → services.incident_service → db_models.incident`, those tables register on the *same shared* `Base.metadata` — and an unscoped `create_all()` would have tried to create them on SQLite too, breaking Priority 1's auth tests for a reason that has nothing to do with Priority 1's own code. Fixed by explicitly scoping `create_all`/`drop_all` to an `AUTH_TABLES` list. Priority 2's own tests (`test_incidents.py`) correctly use a real Postgres+PostGIS fixture instead of trying to force SQLite to support a spatial type it doesn't have.

Also carried over from Priority 1, fixed in this pass for consistency: `schemas/auth.py`'s `RoleOut` used a deprecated nested `class Config:` — switched to `model_config = ConfigDict(from_attributes=True)`, the non-deprecated pydantic v2 idiom.

**Verification performed:** all 28 backend `.py` files (old and new) pass `python -m py_compile`. A `grep` sweep confirms zero remaining live references to `store.INCIDENTS`/`store.REPORTS` outside of explanatory comments, and confirms `store.PREDICTIONS` is the only deliberately-untouched usage. As with Priority 1, I could not execute `pytest` against a live database in this environment — `test_auth.py` needs `pip install -r requirements.txt && pytest tests/test_auth.py -v` (SQLite, no external services), and `test_incidents.py` additionally needs `TEST_DATABASE_URL` pointing at a real Postgres+PostGIS instance.

---

**Files to create:** `core/redis_client.py`, `worker.py` (ARQ worker entrypoint, run via `arq worker.WorkerSettings`), `services/jobs.py` (job functions: `geocode_reverse`, `dedup_check`, `permission_cache_warm`).
**Key decision:** this is also when `core/rbac.py`'s documented caching TODO gets implemented — `perm:{user_id}` in Redis, 5 min TTL, invalidated in `auth_service.assign_role()`.

### Priority 4 — Traffic Prediction Engine
**Files to create:** `db_models/traffic.py` (RoadSegment, SpeedObservation as TimescaleDB hypertable, CongestionPrediction), `services/prediction_service.py` (LightGBM + XGBoost training pipeline, reusing the leakage-audit discipline already applied to the ASTRAM dataset — strict time-based holdout, `.shift(1)` on all rolling features).
**Key decision:** see Step 5 below for the full model comparison and recommendation.

### Priority 5 — Emergency Vehicle Routing
**Files to create:** `services/routing_service.py` (A* over the road graph using live predictions as edge weights), `db_models/emergency.py`, `routers/emergency.py`.
**Permission `emergency:dispatch` is already seeded** in the Priority 1 migration for `emergency_dispatcher` and `super_admin` — no new migration needed just to wire up access control.

### Priority 6 — Multilingual AI Advisory Generation (Gemini)
**Files to create:** `services/advisory_service.py` (RAG context builder + Gemini call + entity-overlap grounding validation + Redis cache), `db_models/advisory.py`.
**Multilingual specifically:** pass target language (`kn`, `hi`, `en`, `ta`) as a parameter in the prompt template, not as separate hard-coded templates per language — one grounded English-language fact summary translated by the same Gemini call, which keeps the grounding-validation step language-independent (validate entity overlap on the English intermediate, not the translated output).
**Permission `advisory:generate` already seeded.**

### Priority 7 — Dashboard Analytics APIs
**Files to modify only:** `routers/api.py`'s `analytics_router.summary()` — replace the hard-coded dict with real aggregate queries (`SELECT event_cause, COUNT(*) FROM incidents GROUP BY event_cause ORDER BY COUNT(*) DESC LIMIT 6`, etc.) against the Priority 2 tables. No new files needed — this is the cheapest priority by far once Priority 2 exists, which is why it's correctly last.

---

## STEP 5 — Traffic Prediction Model Recommendation

| Model | Accuracy (expected) | Training complexity | Inference speed | Data requirement | Hackathon fit | Production fit |
|---|---|---|---|---|---|---|
| **XGBoost** (you have this) | Good — strong on tabular lag features | Low — minutes on a laptop | Very fast (<5ms) | Works with hundreds of rows, improves with thousands | Excellent — fast to demo, explainable via SHAP (already in your stack) | Good — solid baseline, easy to retrain on a cron |
| **CatBoost** (you have this) | Comparable to XGBoost, sometimes better with categorical features (zone, corridor names) without manual encoding | Low — similar to XGBoost | Fast (<10ms) | Same range as XGBoost | Excellent — handles your `corridor`/`zone` string categories natively, less feature-engineering code to write and explain | Good — same operational profile as XGBoost |
| **Graph Neural Network** (e.g. 2-layer GCN over road segments) | Potentially higher — explicitly models "Segment A's jam predicts Segment B's jam," which gradient-boosted trees can only approximate via hand-engineered upstream-speed features | High — needs a graph framework (PyTorch Geometric), careful train/val graph splitting, more hyperparameters | Slower (tens of ms, batched) but still real-time-viable | **Needs substantially more data** — enough observations per segment AND a well-connected graph for message-passing to learn anything beyond noise; your current ASTRAM dataset (8,173 events, mostly point incidents not continuous speed traces) is **not yet enough** to train a GNN that beats the boosted-tree baseline | Risky — easy to overclaim, hard to debug under judging-panel questions about why it's better | Strong only once you have continuous speed-sensor or GPS-probe data at volume — not yet |

**Recommendation: ship XGBoost or CatBoost as the production model now; mention the GNN as a documented Phase 2 roadmap item, not a shipped feature.** This is the single most common overclaim hackathon teams make — "we use a GNN" sounds more impressive in a slide than "we use gradient boosting," but a judge or interviewer who asks "show me the graph construction and the message-passing layer" will immediately find out whether it's real. Shipping CatBoost (it handles your existing `corridor`/`zone`/`event_type` string columns without manual label-encoding, which is less code than what `model_service.py` currently hand-rolls) and being explicit that a GNN is evaluated-but-not-yet-justified-by-data-volume is the more defensible, more Staff-Engineer answer.

---

## STEP 6 — Scalability Review (Target: 100,000+ Users)

| Area | Current state | Required change | Exact steps |
|---|---|---|---|
| **Postgres indexes** | None exist (no DB yet) | GIST index on every geography column from day one of Priority 2 | `CREATE INDEX idx_incidents_geo ON incidents USING GIST (location);` — add directly inside the Priority 2 migration, not as a follow-up |
| **Query optimization** | N/A | Run `EXPLAIN ANALYZE` on every "nearby incidents" query before shipping; confirm it uses the GIST index (`Index Scan`, not `Seq Scan`) | One-time check per query shape, repeat after any schema change to that table |
| **Redis caching** | No Redis yet | Three layers once Priority 3 lands: (1) `perm:{user_id}` permission sets, 5 min TTL; (2) `pred:{segment_id}:{horizon}` prediction cache; (3) `advisory:{zone_id}:{10min_bucket}` LLM response cache | Implement layer 1 first — it's the cheapest win and directly closes the TODO already left in `core/rbac.py` |
| **WebSocket scaling** | No WS yet (Priority 2 ships single-instance, explicitly noted as a limitation) | Redis Pub/Sub backplane once multiple WS gateway instances exist behind a load balancer | Each WS server instance subscribes to all geo-cell Pub/Sub channels; a message published by instance A reaches clients connected to instance B |
| **Background jobs** | None | ARQ with named queues per domain, idempotent job functions, retry with backoff | Mirror the queue catalog from the original system-design doc (incidents, geocoding, predictions, emergency, advisory) |
| **Connection pooling** | `create_engine(..., pool_size=10, max_overflow=20)` already set in `core/database.py` | Add **PgBouncer** in front of Postgres once concurrent connections approach the pool ceiling under load | Transaction-pooling mode, app connects to PgBouncer's port instead of Postgres directly — zero app code changes |
| **Load testing** | None performed | k6 script simulating mixed incident-read + WS-connect + prediction-request traffic at 100k virtual users | Report actual measured P95/P99, don't claim the number unmeasured |

---

## STEP 7 — GitHub Issues

### Milestones
- `M1: Auth & RBAC Foundation` — Priority 1 (this PR)
- `M2: Real-Time Incident Platform` — Priority 2 + 3
- `M3: Intelligence Layer` — Priority 4 + 5
- `M4: AI Advisory & Analytics` — Priority 6 + 7
- `M5: SIH Demo Readiness` — load testing, Grafana dashboards, pitch deck alignment

### Epics, Stories, Tasks

**Epic: Authentication & RBAC** *(Milestone: M1 — ships in this PR)*
- **Story:** As a citizen, I can register and log in so I can submit incident reports under my own identity.
  - Task: SQLAlchemy `User`/`Role`/`Permission` models — *done*
  - Task: `/api/auth/register`, `/api/auth/login` endpoints — *done*
  - Task: Alembic migration seeding 5 roles + permission matrix — *done*
  - **Acceptance criteria:** registering with a duplicate phone number returns 409; an invalid phone format returns 422; a successful login returns both an access and a refresh token.
- **Story:** As a field officer, I can verify incident reports that citizens cannot.
  - Task: `require_permission("incident:verify")` dependency — *done, ready for Priority 2 routes to use*
  - **Acceptance criteria:** a citizen-role token hitting an `incident:verify`-protected route receives 403, not 401.
- **Story:** As a security-conscious system, stolen refresh tokens should have a short blast radius.
  - Task: Refresh-token rotation + reuse detection — *done*
  - **Acceptance criteria:** replaying an already-rotated refresh token revokes all of that user's sessions and returns 401.

**Epic: Real-Time Incident Platform** *(Milestone: M2)*
- **Story:** As a citizen, my submitted report appears on the live map within seconds of officer approval, without anyone refreshing the page.
  - Task: Migrate `store.py` incidents/reports to Postgres + PostGIS
  - Task: `/ws/incidents?bbox=...` WebSocket route
  - Task: In-process async pub/sub for single-instance fanout (Redis backplane deferred to M2.5 once Priority 3 exists)
  - **Acceptance criteria:** a WS client subscribed to a bounding box receives a push within 2 seconds of a matching incident being approved; a client outside that bbox does not.

**Epic: Background Job Processing** *(Milestone: M2)*
- **Story:** As an operator, expensive work (geocoding, photo processing) doesn't block the citizen's report-submission request.
  - Task: ARQ worker setup, Redis broker config
  - Task: `geocode_reverse` job, `dedup_check` job
  - **Acceptance criteria:** `POST /api/reports` returns within 200ms regardless of geocoding API latency; the geocoded address appears on the incident within 10 seconds via a follow-up job.

**Epic: Traffic Prediction Engine** *(Milestone: M3)*
- **Story:** As a control room operator, I see a 15-minute-ahead congestion forecast per road segment, not just current state.
  - Task: TimescaleDB hypertable for speed observations
  - Task: CatBoost training pipeline with strict time-based holdout (no leakage — reuse the audit methodology already applied to the ASTRAM dataset)
  - Task: `/api/congestion/predict` endpoint, Redis-cached
  - **Acceptance criteria:** reported MAE is measured on a held-out time window strictly after the training window, never a random split; the PR description states the actual MAE number, not a target.

**Epic: Emergency Vehicle Routing** *(Milestone: M3)*
- **Story:** As an emergency dispatcher, I get the fastest *predicted* route for an ambulance, not just the shortest distance.
  - Task: A* routing service using `congestion_predictions` as edge weights
  - Task: `/ws/emergency-tracking/{dispatch_id}` live position broadcast
  - **Acceptance criteria:** simulated dispatch produces a route whose predicted travel time is measurably lower than a static-distance route on at least one congested test corridor.

**Epic: Multilingual AI Advisory** *(Milestone: M4)*
- **Story:** As a citizen who reads Kannada, I get a traffic advisory in Kannada, not just English.
  - Task: RAG context builder over live incident/congestion data
  - Task: Gemini call with language parameter + entity-overlap grounding validation
  - **Acceptance criteria:** generated advisories never mention a road/junction name absent from the input context — measured by an automated grounding-rate metric exposed at `/api/admin/advisory/grounding-rate`.

**Epic: Dashboard Analytics** *(Milestone: M4)*
- **Story:** As a control room operator, the analytics page shows real numbers from the database, not the current hard-coded dict.
  - Task: Replace `analytics_router.summary()`'s static return with real GROUP BY queries
  - **Acceptance criteria:** the numbers on the dashboard change when a new incident is created, with no code deploy required.

**Epic: SIH Demo Readiness** *(Milestone: M5)*
- **Story:** As the team, we can answer "does this scale" with a measured number, not a claim.
  - Task: k6 load test script, 100k virtual users, mixed traffic
  - Task: Grafana dashboard showing P50/P95/P99 latency live during the judging demo
  - **Acceptance criteria:** a real load test report exists in the repo with actual numbers, dated, reproducible via a documented command.
