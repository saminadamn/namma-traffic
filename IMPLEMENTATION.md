# Namma Traffic — Sprint Implementation Report

**Project:** Namma Traffic — AI-Powered Traffic Intelligence Platform, Bengaluru  
**Hackathon:** Flipkart Gridlock 2.0  
**Team:** BIT Mesra — CSE Department  
**Stack:** Next.js 14 · FastAPI · PostgreSQL · LightGBM/XGBoost/CatBoost · Gemini 1.5 Flash · Sarvam AI

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                     │
│  App Router · TypeScript · Tailwind CSS · Leaflet Maps       │
│  Public: Home, Heatmap, Report, Track                        │
│  Authority: Dashboard, Command Center, Analytics, Predict    │
│  i18n: English / Hindi / Kannada (static + Sarvam AI)        │
└────────────────────────┬────────────────────────────────────┘
                         │ REST + WebSocket
┌────────────────────────▼────────────────────────────────────┐
│                    BACKEND (FastAPI)                          │
│  Auth · Incidents · Reports · Analytics · Advisory           │
│  Predict · Heatmap · Command Center · Translation            │
│  Rate limiting (slowapi) · Prometheus /metrics               │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────┘
       │          │          │          │          │
  PostgreSQL   Redis      Cloudinary  Gemini    Sarvam AI
  (SQLAlchemy  (Upstash)   (photos)   Flash    (translation)
   + Alembic)              
       │          │
   ML Models   ARQ Worker
  CatBoost +  (geocoding +
   XGBoost     hotspot cron)
```

---

## 2. What Was Built — Feature by Feature

---

### Step 1 — Real Analytics SQL Queries

**Problem:** Analytics dashboard showed hardcoded fake numbers.

**Solution:** Replaced with live SQL aggregates via SQLAlchemy.

**Files changed:**
- `backend/services/incident_service.py` — `analytics_summary(db)` function

**How it works:**
```python
# Single query returns 4 scalars at once using SQLAlchemy case()
total, active, high_priority, road_closures = db.query(
    func.count(Incident.id),
    func.count(case((Incident.status == "active", 1))),
    func.count(case((Incident.priority == "High", 1))),
    func.count(case((Incident.requires_road_closure.is_(True), 1))),
).one()

# Top causes — GROUP BY + ORDER BY count DESC
top_causes = db.query(Incident.event_cause, func.count(Incident.id).label("cnt"))
    .group_by(Incident.event_cause).order_by(func.count(Incident.id).desc()).limit(6).all()

# Monthly trend — func.to_char for month label, func.extract for sort order
monthly_trend = db.query(
    func.to_char(Incident.start_datetime, "Mon").label("month"),
    func.extract("month", Incident.start_datetime).label("month_num"),
    func.count(Incident.id).label("cnt")
).filter(func.extract("year", Incident.start_datetime) == func.extract("year", func.now()))
 .group_by(...).order_by("month_num").all()
```

**API endpoint:** `GET /api/analytics/summary`

---

### Step 2 — DBSCAN Hotspot Detection (Real ML)

**Problem:** Hotspot map showed the same 8 hardcoded Bengaluru junctions regardless of actual incident data.

**Solution:** scikit-learn DBSCAN clustering on real lat/lon values from the incidents table.

**Files changed:**
- `backend/services/incident_service.py` — `dbscan_hotspots(db, limit)` function

**How it works:**
```python
from sklearn.cluster import DBSCAN
import numpy as np

# Fetch all incident coordinates
rows = db.query(Incident.latitude, Incident.longitude, 
                Incident.event_cause, Incident.address).all()

coords = np.array([[r.latitude, r.longitude] for r in rows])

# Convert 0.5 km radius to radians for haversine metric
eps_rad = 0.5 / 6371.0

labels = DBSCAN(
    eps=eps_rad, min_samples=2,
    algorithm="ball_tree", metric="haversine"
).fit_predict(np.radians(coords))

# Aggregate each cluster: centroid lat/lon, dominant cause, count
```

**Fallback:** When DB has fewer than 2 incidents, returns 8 static Bengaluru hotspots so the map always shows something in demo.

**API endpoint:** `GET /api/heatmap/hotspots?limit=8`

---

### Step 3 — Trained ML Ensemble (XGBoost + CatBoost)

**Problem:** Prediction page used a rule-based heuristic. No real model. Server log showed: `"Models not loaded — using fallback scorer"`.

**Solution:** Trained XGBoost + CatBoost ensemble on 20,000 synthetic Bengaluru traffic records.

**Files changed:**
- `backend/scripts/train_model.py` — training script (new)
- `backend/services/model_service.py` — `load()` now loads CatBoost
- `backend/config.py` — `model_path = "models/catboost_model.pkl"`
- `backend/models/` — `catboost_model.pkl`, `xgb_model.pkl`, `tfidf.pkl`

**Training data generation:**
```python
# Each row: event type + corridor + zone + time features → closure label
# Uses sigmoid decision boundary (slope=9) for clean class separation
prob = sigmoid(9.0 * (raw_score - 0.38))

# raw_score = 0.55*event_type_rate + 0.25*corridor_rate + 
#             0.10*zone_rate + time_features
```

**Model results:**

| Model | AUC | Accuracy |
|-------|-----|----------|
| CatBoost | 0.827 | 76.2% |
| XGBoost | 0.823 | 76.0% |
| Ensemble | 0.826 | 76.0% |

**Majority class baseline was 65.9%** — the ensemble beats it by +10 percentage points.

**Ensemble prediction:**
```python
p = 0.55 * catboost.predict_proba(X)[0][1] + 0.45 * xgb.predict_proba(X)[0][1]
```

**SHAP explainability:** Every prediction returns the top 6 features with direction (positive = increases closure risk). Shown to officers on the predict page.

**Features used:** hour, day-of-week, month, is_weekend, is_peak, is_night, latitude, longitude, historical corridor closure rate, historical zone closure rate, historical event-type closure rate, encoded categoricals.

**To retrain:**
```bash
cd backend/
python scripts/train_model.py
```
Only 3 files ever need updating if you change the model: `train_model.py`, `config.py` (model filename), and `model_service.py` (if the new model has a different API).

---

### Step 4 — Gemini 1.5 Flash Advisory Generation

**Problem:** Command center showed template-based advisories ("High congestion detected at X. Deploy Y officers."). Not impressive.

**Solution:** Gemini 1.5 Flash API (free tier) generates real natural-language tactical advisories for the top-priority incident.

**Files changed:**
- `backend/services/advisory_service.py` — `generate_advisory()` async function
- `backend/config.py` — `gemini_api_key: str = ""`

**How it works:**
```python
import asyncio
import google.generativeai as genai

async def generate_advisory(address, zone, severity_label, severity_score):
    genai.configure(api_key=settings.gemini_api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")
    
    prompt = f"""You are a Bengaluru Traffic Control Room officer...
    Incident: {address}, Zone: {zone}
    Severity: {severity_label} ({severity_score}/100)
    Generate a 2-sentence tactical advisory..."""
    
    # Run sync SDK in thread so we don't block the async event loop
    response = await asyncio.to_thread(model.generate_content, prompt)
    return {"text": response.text, "severity": severity_label, ...}
```

**Graceful fallback:** When `GEMINI_API_KEY` is not set, returns a rule-based template advisory. The command center never crashes.

**API endpoint:** `GET /api/advisory/latest`

---

### Step 5 — Photo Upload via Cloudinary

**Problem:** Citizen report form had a photo upload button that did nothing — photos were silently discarded.

**Solution:** Cloudinary free tier (25 GB storage). Upload happens asynchronously before saving the report.

**Files changed:**
- `backend/services/upload_service.py` — `upload_photo(photo)` async function (new)
- `backend/routers/api.py` — `create_report` calls `await upload_service.upload_photo(photo)`
- `backend/config.py` — `cloudinary_cloud_name`, `cloudinary_api_key`, `cloudinary_api_secret`

**How it works:**
```python
async def upload_photo(photo: UploadFile | None) -> str | None:
    if photo is None or not photo.filename: return None
    if not settings.cloudinary_cloud_name: return None  # keys absent → skip
    if not photo.content_type.startswith("image/"): return None
    
    data = await photo.read()
    if len(data) > 10 * 1_048_576: return None  # 10 MB hard limit
    
    # Cloudinary SDK is sync — run in thread to avoid blocking event loop
    return await asyncio.to_thread(_do_upload, data, settings)

def _do_upload(data: bytes, s) -> str:
    cloudinary.config(cloud_name=s.cloudinary_cloud_name, ...)
    result = cloudinary.uploader.upload(data, folder="namma_traffic/reports", ...)
    return result["secure_url"]  # HTTPS URL stored in citizen_reports.photo_url
```

---

### Step 6 — Rate Limiting (slowapi)

**Problem:** No rate limiting on auth or reporting endpoints — trivially abusable.

**Solution:** slowapi — pure Python, wraps FastAPI, no Redis required.

**Files changed:**
- `backend/main.py` — global 200/min default + exception handler
- `backend/routers/auth.py` — per-route limits
- `backend/routers/api.py` — report creation limit

**Limits applied:**

| Endpoint | Limit |
|----------|-------|
| `POST /api/auth/login` | 10 per minute per IP |
| `POST /api/auth/register` | 5 per minute per IP |
| `POST /api/reports` | 20 per minute per IP |
| All other routes | 200 per minute per IP (global default) |

**Implementation:**
```python
# main.py
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# auth.py
@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, ...):
```

Returns HTTP 429 with `Retry-After` header when limit exceeded.

---

### Step 7 — Redis Token Blacklist (Upstash)

**Problem:** After logout, the access token (15-min TTL) could still be used to make authenticated requests — sign-out was not truly secure.

**Solution:** On logout, hash the access token and store it in Redis with TTL equal to the remaining token lifetime. Every authenticated request checks the blacklist.

**Files created/changed:**
- `backend/core/redis_client.py` — singleton client, graceful no-op when Redis absent (new)
- `backend/core/rbac.py` — `get_current_user` checks blacklist before authorizing
- `backend/routers/auth.py` — `logout` adds access token hash to Redis
- `backend/config.py` — `redis_url: str = ""`

**How it works:**
```python
# On logout — auth.py
raw_token = authorization.removeprefix("Bearer ")
token_hash = sha256(raw_token.encode()).hexdigest()[:32]
await blacklist_token(token_hash, ttl=access_token_expire_minutes * 60)

# On every request — rbac.py  
token_hash = sha256(token.encode()).hexdigest()[:32]
if await is_blacklisted(token_hash):
    raise HTTPException(401, "Could not validate credentials")
```

**Graceful fallback:** `redis_client.py` wraps every Redis call in try/except. When `REDIS_URL` is empty or Redis is unreachable, `is_blacklisted()` returns `False` and `blacklist_token()` is a no-op. The app works exactly as before — access tokens just expire naturally via JWT TTL.

**To activate:** Add `REDIS_URL=rediss://default:xxx@host.upstash.io:6379` to `backend/.env` (Upstash free tier).

---

### Step 8 — ARQ Background Jobs

**Problem:** After a citizen report is submitted, the address field is whatever the user typed (often vague). No automated enrichment. Hotspot DBSCAN ran on every request (expensive at scale).

**Solution:** ARQ job queue over Redis for two background jobs:

1. **`geocode_report`** — triggered after every report POST. Calls Nominatim (OpenStreetMap reverse geocoding, free, no API key) and updates the report's address in the DB.
2. **`recalculate_hotspots`** — cron job runs every 15 minutes. Runs DBSCAN on live incidents, stores result in Redis (`hotspots:cached`, TTL 15 min). The `/api/heatmap/hotspots` endpoint reads from cache, falls back to live query if cache is cold.

**Files created/changed:**
- `backend/worker.py` — ARQ WorkerSettings + both job functions (new)
- `backend/services/arq_service.py` — pool singleton + `enqueue()` helper (new)
- `backend/routers/api.py` — `create_report` enqueues geocode job; `hotspots` reads cache

**Architecture:**
```
POST /api/reports
  → incident_service.create_report() saves to DB
  → arq_service.enqueue("geocode_report", report_id)  ← non-blocking
  → returns tracking ID immediately

ARQ Worker (separate process):
  → picks up geocode_report job
  → calls Nominatim API with lat/lon
  → updates CitizenReport.address in DB

Cron every :00/:15/:30/:45:
  → recalculate_hotspots runs DBSCAN
  → stores JSON result in Redis with 15-min TTL

GET /api/heatmap/hotspots:
  → checks Redis cache
  → if hit: returns cached JSON (microseconds)
  → if miss: runs DBSCAN live (fallback)
```

**How to run the worker:**
```bash
# In backend/ with venv activated
arq worker.WorkerSettings
```

Worker primes the hotspot cache on startup immediately — no cold-start wait.

---

### Step 9 — Prometheus Observability

**Problem:** No metrics to show API health, latency, or throughput during demo.

**Solution:** `prometheus-fastapi-instrumentator` — one import, auto-instruments every route.

**Files changed:**
- `backend/main.py` — two lines after router registration

```python
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)
```

**Metrics exposed at `GET /metrics`:**
- `http_requests_total` — by method, endpoint, status code
- `http_request_duration_seconds` — histogram (p50/p95/p99 latency)
- `http_requests_in_progress` — current concurrent requests

---

## 3. Multilingual Support (EN / HI / KN)

**Problem:** UI was English-only. SIH judges expected multilingual support for a Bengaluru civic platform.

**Solution:** Three-layer translation system:

**Layer 1 — Static bundled strings (always works, instant)**
All ~80 UI strings pre-translated into Hindi and Kannada and bundled in `frontend/lib/translations.ts`. Switching language is instant — zero network calls.

**Layer 2 — Sarvam AI SDK (when API key configured)**
`backend/routers/translate.py` uses Sarvam AI's `AsyncSarvamAI` client to translate the full string set. The import is inside try/except so a missing package never crashes the server.

**Layer 3 — MyMemory API (free fallback)**
When no Sarvam key: batches of 5 strings are translated via `api.mymemory.translated.net` concurrently using httpx.

**Frontend `LanguageContext`:**
- Seeds cache with static translations on init (instant display)
- Calls backend `POST /api/translate-batch` in the background for quality upgrade
- Caches result per language in localStorage
- `t("key")` is the single access point — every component just calls this

**Pages with full translation:**
- Home page, Public nav header
- Citizen: Heatmap, Report form, Track page
- Authority: Login page (has its own LanguageSwitcher)

---

## 4. PostGIS-Optional Architecture

**Problem:** Local development has no PostGIS extension. The migration runs fine without it but the ORM model declared `location` as `Geography(...)` from GeoAlchemy2. GeoAlchemy2 automatically wraps every SELECT with `ST_AsBinary(location)` and every INSERT with `ST_GeogFromText(...)`. Both fail when PostGIS isn't installed.

**Solution:** Two-layer fix:

**Layer 1 — ORM model** (`backend/db_models/incident.py`):
Changed `location` from `Geography(...)` to plain `String`. GeoAlchemy2 no longer touches any SQL for that column. Since `latitude` and `longitude` float columns are what all serializers actually use, this is safe.

**Layer 2 — Service layer** (`backend/services/incident_service.py`):
```python
_postgis_ok: bool | None = None

def _has_postgis(db: Session) -> bool:
    global _postgis_ok
    if _postgis_ok is None:
        try:
            db.execute(text("SELECT PostGIS_Version()"))
            _postgis_ok = True
        except Exception:
            db.rollback()
            _postgis_ok = False
    return _postgis_ok
```

`create_incident` and `create_report` call `_has_postgis(db)` before building the geography point. On production (Supabase/Render with real PostGIS), the geography column is written correctly. Locally, `location = None`.

---

## 5. Security Architecture

| Layer | Implementation |
|-------|---------------|
| Password hashing | bcrypt via passlib |
| Tokens | JWT (access: 15 min, refresh: 7 days) |
| Refresh token storage | SHA-256 hash in PostgreSQL `refresh_tokens` table |
| Refresh token rotation | One-time-use — each refresh issues a new pair |
| Token reuse detection | Stolen token replay → all sessions for that user revoked |
| Access token blacklist | Redis SHA-256 hash with TTL (Step 7) |
| Rate limiting | slowapi per-IP, per-endpoint (Step 6) |
| RBAC | Roles (`citizen`, `officer`, `admin`) → permission codes → `require_permission()` FastAPI dependency |

---

## 6. Real-Time WebSocket

**Implementation:** `backend/routers/websocket.py` — `ConnectionManager` class maintains a set of active WebSocket connections. On every `create_incident` or `verify_report`, the route calls `await manager.broadcast(event_type, data)` which sends JSON to all connected clients.

**Frontend:** `TrafficMap` component connects to `ws://localhost:8000/ws` and updates incident markers in real time without polling.

---

## 7. API Endpoints Summary

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login → access + refresh tokens |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Revoke refresh token + blacklist access token |
| GET | `/api/auth/me` | Current user profile |
| GET | `/api/incidents` | List incidents (filterable by status) |
| POST | `/api/incidents` | Create incident (triggers WebSocket broadcast) |
| GET | `/api/incidents/priority-ranking` | Top incidents by ML severity score |
| GET | `/api/reports` | List citizen reports |
| POST | `/api/reports` | Submit citizen report (with optional photo) |
| PATCH | `/api/reports/verify` | Officer approve/reject report |
| GET | `/api/analytics/summary` | Live SQL aggregates |
| GET | `/api/heatmap` | Incident points for heatmap |
| GET | `/api/heatmap/hotspots` | DBSCAN clusters (Redis-cached) |
| POST | `/api/predict` | ML risk prediction + SHAP features |
| POST | `/api/translate-batch` | Batch text translation |
| GET | `/api/advisory/latest` | Gemini-generated tactical advisory |
| GET | `/command-center/summary` | Command center KPIs |
| GET | `/generate-demo-data` | Seed 13 realistic demo incidents |
| GET | `/metrics` | Prometheus metrics |
| WS | `/ws` | Real-time incident feed |

---

## 8. File Structure

```
backend/
├── main.py                    # FastAPI app, routers, rate limiter, Prometheus
├── worker.py                  # ARQ background worker (run separately)
├── config.py                  # Settings (pydantic-settings, .env)
├── core/
│   ├── database.py            # SQLAlchemy engine + session
│   ├── security.py            # JWT + bcrypt utilities
│   ├── rbac.py                # Auth dependencies + permission checks
│   └── redis_client.py        # Singleton Redis client (graceful fallback)
├── db_models/
│   ├── user.py                # User, Role, Permission, RefreshToken, AuditLog
│   └── incident.py            # Incident, CitizenReport, IncidentType
├── services/
│   ├── model_service.py       # CatBoost+XGBoost ensemble + SHAP
│   ├── incident_service.py    # CRUD + DBSCAN + analytics SQL
│   ├── advisory_service.py    # Gemini Flash advisory generation
│   ├── upload_service.py      # Cloudinary photo upload
│   ├── arq_service.py         # ARQ pool + enqueue helper
│   ├── auth_service.py        # Register, login, token rotation
│   └── ...
├── routers/
│   ├── api.py                 # All main endpoints
│   ├── auth.py                # Auth endpoints
│   ├── translate.py           # Translation endpoint
│   ├── command_center.py      # Command center summary
│   └── ...
├── models/
│   ├── catboost_model.pkl     # Trained CatBoost (76.2% acc, AUC 0.83)
│   ├── xgb_model.pkl          # Trained XGBoost
│   └── tfidf.pkl              # TF-IDF for text features
└── scripts/
    └── train_model.py         # Retrain script

frontend/
├── app/
│   ├── page.tsx               # Home (fully translated)
│   ├── citizen/
│   │   ├── heatmap/page.tsx   # Live heatmap + hotspots
│   │   ├── report/page.tsx    # Incident report form
│   │   └── track/page.tsx     # Report tracking
│   └── authority/
│       ├── login/page.tsx     # Authority login (with LanguageSwitcher)
│       ├── command-center/    # Executive dashboard
│       ├── analytics/         # Charts from real SQL
│       └── ...
├── components/
│   ├── PublicHeader.tsx        # Nav with LanguageSwitcher
│   └── LanguageSwitcher.tsx    # EN/HI/KN dropdown
├── contexts/
│   └── LanguageContext.tsx     # i18n state + static translations
└── lib/
    ├── api.ts                  # All API calls
    └── translations.ts         # Static EN/HI/KN string map
```

---

## 9. How to Run

### Backend
```bash
cd backend/
py -3.12 -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Train ML models (first time only)
python scripts/train_model.py

# Start API server
uvicorn main:app --reload

# (Optional) Start ARQ worker — needs REDIS_URL in .env
arq worker.WorkerSettings
```

### Frontend
```bash
cd frontend/
npm install
npm run dev
```

### Environment variables (`backend/.env`)
```
DATABASE_URL=postgresql://user:pass@localhost:5432/namma_traffic
JWT_SECRET_KEY=<openssl rand -hex 32>
GEMINI_API_KEY=           # Gemini 1.5 Flash (free tier)
SARVAM_API_KEY=           # Sarvam AI translation (optional)
CLOUDINARY_CLOUD_NAME=    # Cloudinary (free 25 GB)
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
REDIS_URL=                # Upstash free tier (optional)
```

---

## 10. What Runs Without Any API Keys

The entire system is designed to degrade gracefully. With only a PostgreSQL database, every feature works:

| Feature | No keys | With keys |
|---------|---------|-----------|
| Incident CRUD + WebSocket | Full | Full |
| ML prediction (CatBoost+XGBoost) | Full | Full |
| DBSCAN hotspot detection | Full | Full |
| Real-time analytics | Full | Full |
| Advisory generation | Rule-based template | Gemini natural language |
| Photo upload | Skipped silently | Stored in Cloudinary |
| Translation | Static bundled (instant) | Sarvam AI quality upgrade |
| Token blacklist on logout | Tokens expire naturally (15 min) | Immediate invalidation |
| Background geocoding | Skipped | Address auto-enriched |
| Hotspot caching | Live query every request | Redis cache (15 min TTL) |
| Rate limiting | Active (no Redis needed) | Active |
| Prometheus metrics | Active | Active |
