<div align="center">

<img src="docs/logo.png" alt="Namma AI" width="320" />

# Namma AI
### Smarter Roads. Safer Journeys.

**AI-powered Traffic Intelligence Platform for Bengaluru**

<img src="docs/hero.png" alt="Namma AI Platform" width="100%" />

</div>

---

## Overview

Namma AI is a traffic intelligence platform that helps Bengaluru Traffic Police shift from reactive patrol to proactive, data-driven enforcement. It predicts event-related congestion, recommends resource deployment, surfaces incident hotspots on a live heatmap, lets citizens report incidents directly to authorities, and generates AI-written tactical advisories via Gemini Flash.

Built for **Flipkart Gridlock 2.0** · Next.js 14 frontend + FastAPI backend · PostgreSQL database.

---

## Features

| Module | Who | What it does |
|---|---|---|
| **Landing + role selection** | Public | Choose citizen or authority portal |
| **Event risk prediction** | Authority | CatBoost + XGBoost ensemble — risk score (0–100), road-closure probability, priority label, SHAP feature explanations |
| **Authority ML predict** | Authority | Dedicated CatBoost closure-probability + priority endpoint used by the predict page |
| **Incident heatmap** | Both | Live incident pins + DBSCAN-clustered historical hotspots on an interactive map |
| **Submit incident report** | Citizen | Category + location + optional photo (Cloudinary), returns tracking ID |
| **Track report** | Citizen | Follow a report's status by tracking ID |
| **Safe route** | Citizen | Incident-aware route planning via OSRM — scores alternatives by severity, excludes road closures |
| **Verify reports** | Authority | Approve/reject citizen reports; approved ones feed the live map via WebSocket |
| **Analytics** | Authority | Real SQL aggregates — incident trends by cause, zone, month, and priority |
| **Dashboard** | Authority | KPIs + top-priority incidents pulled from live DB |
| **Command center** | Authority | AI-generated tactical advisory (Gemini Flash) + operational summary |
| **Event simulation** | Authority | Forecast congestion impact of a planned event before it happens |
| **What-if analysis** | Authority | Model what happens if a corridor closes for N hours |
| **Diversion planning** | Authority | ASTRAM routing engine — auto-generates diversion routes for road closures |
| **SHAP explainability** | Authority | Per-prediction feature-importance breakdown |
| **Resources** | Authority | Per-incident officer and barricade deployment recommendations |
| **Auth / RBAC** | All | JWT access + refresh tokens, role-based permissions (`citizen`, `officer`, `admin`) |
| **Multilingual** | All | EN / HI / KN — static bundled strings (instant) with Sarvam AI / Bhashini quality upgrade |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Leaflet (OpenStreetMap), Recharts |
| Backend | FastAPI, Pydantic v2, slowapi (rate limiting) |
| Database | PostgreSQL — SQLAlchemy ORM, Alembic migrations |
| ML models | CatBoost (`closure_model.cbm`, `priority_model.cbm`) + XGBoost + SHAP |
| Background jobs | ARQ (async Redis job queue) |
| Caching / blacklist | Redis — Upstash free tier (optional) |
| AI advisory | Google Gemini Flash (free tier) |
| Translation | Sarvam AI or Bhashini (both optional, static fallback ships out of the box) |
| Photo upload | Cloudinary (free 25 GB tier) |
| Routing | OSRM public demo server + ASTRAM diversion engine |
| Observability | Prometheus (`/metrics`), structured logging |
| Maps & weather | OpenStreetMap tiles, Open-Meteo API (both free, no key needed) |

---

## Run locally (Windows / PowerShell)

> **Prerequisites:** [Python 3.12+](https://www.python.org/downloads/) (tick "Add python.exe to PATH") and [Node.js LTS](https://nodejs.org). After installing, close and reopen PowerShell.
>
> ```powershell
> python --version
> node --version
> ```

You need **two PowerShell windows** open at the same time. Both run from the `namma-traffic-sih-sprint` root.

### Window 1 — Backend

```powershell
cd backend
py -3.12 -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt

# First run only — train and place ML models
python scripts/train_model.py

uvicorn main:app --reload
```

> If you get *"running scripts is disabled on this system"*, run once then retry:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

Backend lives at **http://localhost:8000** · Swagger docs at **http://localhost:8000/docs**.

### Window 2 — Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**.

### (Optional) ARQ background worker

Requires `REDIS_URL` in `backend/.env`.

```powershell
cd backend
venv\Scripts\Activate.ps1
arq worker.WorkerSettings
```

---

## Run locally (Mac / Linux)

```bash
# Terminal 1 — backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python scripts/train_model.py   # first run only
uvicorn main:app --reload

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

---

## Environment variables (`backend/.env`)

Only `DATABASE_URL` and `JWT_SECRET_KEY` are required. Everything else degrades gracefully when absent.

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/namma_traffic
JWT_SECRET_KEY=<openssl rand -hex 32>

# Optional — AI features
GEMINI_API_KEY=           # Gemini Flash advisory (free tier)
SARVAM_API_KEY=           # Sarvam AI translation (Indian languages)
BHASHINI_INFERENCE_API_KEY=   # Bhashini / Dhruva inference key
BHASHINI_UDYAT_API_KEY=
BHASHINI_USER_ID=
BHASHINI_PIPELINE_ID=

# Optional — storage
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Optional — Redis (Upstash free tier)
REDIS_URL=rediss://default:xxx@host.upstash.io:6379
```

### What works without any API keys

| Feature | No keys | With keys |
|---|---|---|
| Incident CRUD + WebSocket | Full | Full |
| ML prediction (CatBoost + XGBoost) | Full | Full |
| DBSCAN hotspot detection | Full | Full |
| Real-time analytics | Full | Full |
| Advisory generation | Rule-based template | Gemini natural language |
| Photo upload | Skipped silently | Stored in Cloudinary |
| Translation | Static bundled (instant) | Sarvam AI / Bhashini quality upgrade |
| Token blacklist on logout | Tokens expire naturally (15 min) | Immediate invalidation |
| Background geocoding | Skipped | Address auto-enriched |
| Rate limiting | Active (no Redis needed) | Active |
| Prometheus metrics | Active | Active |

---

## Demo flow (for judges)

1. Open **http://localhost:3000** → click **I'm a citizen**
2. Submit an incident — category + location + description. Copy the tracking ID.
3. Open **http://localhost:3000** → click **I'm an authority** → log in as an officer
4. Go to **Verify reports** → approve the citizen report
5. Open **Dashboard** and **Heatmap** — the approved incident appears live (WebSocket push)
6. Open **Command Center** — Gemini-generated tactical advisory for the top incident
7. Open **Simulate** or **What-if** to explore future scenarios

---

## Page routes

| Route | Who | Description |
|---|---|---|
| `/` | Public | Landing + role selection |
| `/citizen/report` | Citizen | Submit incident report with optional photo |
| `/citizen/track` | Citizen | Track report status by ID |
| `/citizen/heatmap` | Citizen | Live incident map + DBSCAN hotspots |
| `/citizen/route` | Citizen | Incident-aware safe route planner |
| `/authority/login` | Authority | JWT login |
| `/authority/dashboard` | Authority | KPIs + top-priority live incidents |
| `/authority/command-center` | Authority | AI advisory + operational summary |
| `/authority/predict` | Authority | ML risk prediction + SHAP explanations |
| `/authority/analytics` | Authority | Incident trends (charts from live SQL) |
| `/authority/heatmap` | Authority | Heatmap with admin overlays |
| `/authority/resources` | Authority | Deployment recommendations per incident |
| `/authority/verify` | Authority | Approve / reject citizen reports |
| `/authority/simulate` | Authority | Event simulation — forecast congestion before events |
| `/authority/what-if` | Authority | What-if corridor closure analysis |

---

## API summary

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Login → access + refresh tokens |
| POST | `/api/auth/register` | Citizen self-registration |
| POST | `/api/auth/refresh` | Rotate refresh token |
| POST | `/api/auth/logout` | Revoke token + blacklist access token |
| GET | `/api/auth/me` | Current user profile + roles |
| GET | `/api/incidents` | List incidents (filterable) |
| POST | `/api/incidents` | Create incident (WebSocket broadcast) |
| GET | `/api/incidents/priority-ranking` | Top incidents by ML severity score |
| GET | `/api/reports` | List citizen reports |
| POST | `/api/reports` | Submit citizen report + optional photo |
| PATCH | `/api/reports/verify` | Officer approve/reject |
| GET | `/api/analytics/summary` | Live SQL aggregates |
| GET | `/api/heatmap` | Incident points for heatmap |
| GET | `/api/heatmap/hotspots` | DBSCAN clusters (Redis-cached) |
| POST | `/api/ml-predict` | CatBoost closure probability + priority label |
| POST | `/api/predict` | XGBoost ensemble risk score + SHAP |
| POST | `/prediction/explain` | SHAP explainability breakdown |
| POST | `/simulate-event` | Event congestion simulation |
| POST | `/what-if` | What-if corridor closure analysis |
| GET | `/command-center/summary` | Command center KPIs + advisory |
| GET | `/api/advisory/latest` | Gemini-generated tactical advisory |
| POST | `/api/translate-batch` | Batch text translation |
| POST | `/api/route` | Incident-aware safe route (OSRM) |
| POST | `/api/diversion/plan` | Generate diversion plan for incident |
| GET | `/api/diversion/incidents` | Active incidents with road status |
| GET | `/generate-demo-data` | Seed 13 realistic demo incidents |
| GET | `/metrics` | Prometheus metrics |
| GET | `/health` | Health check |
| WS | `/ws` | Real-time incident feed |

---

## Deploy

- **Backend → Render:** New Web Service, root `backend`, start command `uvicorn main:app --host 0.0.0.0 --port $PORT`. Set env vars in the Render dashboard. Add an Uptime Robot ping on `/health` every 14 min (free tier).
- **Frontend → Vercel:** Import repo, root `frontend`, set `NEXT_PUBLIC_API_URL` to your Render URL.

---

<div align="center">

**Namma AI** · Smarter Roads. Safer Journeys.  
BIT Mesra · ML Baddies · Flipkart Gridlock 2.0 · 2026

</div>
