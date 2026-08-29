<div align="center">

<img src="docs/logo.png" alt="Namma AI" width="320" />

# Namma AI
### Smarter Roads. Safer Journeys.

**Traffic Intelligence Platform for Bengaluru**

![Python](https://img.shields.io/badge/Python-3.11+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791?logo=postgresql&logoColor=white)
![CatBoost](https://img.shields.io/badge/ML-CatBoost-orange)

<img src="docs/hero.png" alt="Namma Traffic Platform" width="100%" />

</div>

---

## Overview

Namma AI helps Bengaluru Traffic Police shift from reactive patrol to proactive, data-driven enforcement. It predicts incident severity and road-closure probability using a CatBoost ML model, recommends officer and barricade deployment, generates diversion routes, surfaces hotspots on a live heatmap, and lets citizens report incidents directly to authorities.

Next.js 15 · FastAPI · PostgreSQL · CatBoost

### Capabilities

| Area | What ships |
|---|---|
| Prediction | CatBoost closure probability + priority ranking, with a heuristic fallback when model files are unavailable |
| Explainability | SHAP factor breakdown behind `/prediction/explain` |
| Incident telemetry | Real-time push over WebSocket |
| Authentication | JWT access + rotating refresh tokens |
| Access control | Role-based (Citizen / Traffic Personnel / Authority) |
| API | REST, with auto-generated Swagger docs at `/docs` |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, Leaflet (OpenStreetMap), Recharts |
| Backend | FastAPI, Pydantic v2, SQLAlchemy |
| Database | PostgreSQL |
| ML | CatBoost (closure probability + priority ranking), DBSCAN (hotspot clustering) |
| Routing | OSRM public server + custom diversion engine |
| Maps & weather | OpenStreetMap tiles, Open-Meteo API (both free, no key needed) |

---
<img width="1920" height="1080" alt="Why Do We Need Namma Traffic" src="https://github.com/user-attachments/assets/af969a8d-ab4b-4f88-a9b4-3bacce3e0c48" />

---

## Folder Structure

```
namma-traffic/
├── backend/              # FastAPI app
│   ├── routers/          # HTTP layer — one module per feature area
│   ├── services/         # Business logic and ML inference
│   ├── db_models/        # SQLAlchemy ORM models
│   ├── alembic/          # Database migrations
│   ├── models/           # .pkl ensemble used by model_service
│   ├── ml_models/        # .cbm CatBoost models used by catboost_service
│   ├── diversion_engine/ # Road-network diversion planning
│   └── main.py
├── frontend/             # Next.js 15 app (citizen + authority views)
│   ├── app/
│   └── components/
├── docs/                 # ARCHITECTURE.md, logo, hero image
└── README.md
```

---

## Run Locally

### Prerequisites

- [Python 3.11 or 3.12](https://www.python.org/downloads/) — tick "Add python.exe to PATH"
- [Node.js LTS](https://nodejs.org)
- [PostgreSQL 14+](https://www.postgresql.org/download/)

### 1 — Database

```bash
createdb traffic_db
```

### 2 — Backend

Open a terminal in the project root:

```bash
# Windows (PowerShell)
cd backend
py -3 -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

```bash
# Mac / Linux
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

> If PowerShell blocks script execution, run once:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

Backend: **http://localhost:8000** · Swagger docs: **http://localhost:8000/docs**

The schema (all tables and columns) is created automatically on first start.

### 3 — Environment variables

Create `backend/.env`:

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/traffic_db
JWT_SECRET_KEY=any-random-string-here

# Optional — only needed for Gemini advisory and Cloudinary photo upload
GEMINI_API_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

### 4 — Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

---

## Demo Flow

1. **Open** http://localhost:3000
2. **Seed data** — click "I'm an Authority" → log in (`9000000000` / `Admin@1234`) → Dashboard → expand *Admin Tools* → click **Generate demo data**
3. **Citizen view** — go back to home → click "I'm a Citizen" → try Safe Route Finder and Live Heatmap
4. **Report an incident** — Citizen → Report Incident → fill form → submit → copy tracking ID
5. **Verify it** — Authority → Verify Reports → approve the report → watch it appear on the dashboard live
6. **Resource planning** — Authority → Deployment → see per-incident officer and barricade recommendations
7. **Diversion** — Authority → Diversion Plans → click "Diversion plan" on any incident

---

## Roles & Logins

Sign-in is by **phone number**, not username. Both demo accounts are seeded by
the migrations, and each login page has a button that fills them in for you.

| Role | How to access | Phone | Password |
|---|---|---|---|
| Citizen | Home → "I'm a Citizen" | — | no login needed |
| Traffic Personnel | Home → "I'm Traffic Personnel" | `9333333333` | `Traffic@1234` |
| Authority | Home → "I'm an Authority" → Login | `9000000000` | `Admin@1234` |

---

## Page Routes

| Route | Who | Description |
|---|---|---|
| `/` | Public | Landing + role selection |
| `/citizen/report` | Citizen | Submit incident report |
| `/citizen/heatmap` | Citizen | Live incident map + hotspots |
| `/citizen/route` | Citizen | Incident-aware safe route planner |
| `/citizen/track` | Citizen | Look up a submitted report by tracking ID |
| `/traffic/login` | Personnel | Traffic personnel login |
| `/authority/login` | Authority | JWT login |
| `/authority/signup` | Authority | Register an authority account |
| `/authority/dashboard` | Authority | Live KPIs + priority incidents |
| `/authority/predict` | Authority | ML closure probability + priority ranking |
| `/authority/analytics` | Authority | Incident trends (charts from live DB) |
| `/authority/resources` | Authority | Per-incident deployment recommendations |
| `/authority/diversion` | Authority | Auto-generated diversion routes |
| `/authority/heatmap` | Authority | Incident map + hotspot clusters |
| `/authority/verify` | Authority | Approve / reject citizen reports |

`/authority/command-center`, `/authority/simulate` and `/authority/what-if` are
redirects kept for older links; they land on the dashboard and predict pages.

---

## API Example

**`POST /api/predict`** — returns closure probability, priority ranking and the
resulting deployment recommendation for an event.

Request (all fields below except `weather`, `veh_type` and `description` are required):

```json
{
  "event_type": "accident",
  "incident_type": "unplanned",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "address": "MG Road, near Trinity Metro",
  "corridor": "MG Road",
  "police_station": "Ashok Nagar",
  "zone": "Central Zone 1",
  "date": "2026-08-29",
  "time": "18:30",
  "weather": "rain",
  "veh_type": "car",
  "description": "Two-vehicle collision blocking one lane"
}
```

Response:

```json
{
  "closure_probability": 0.2651,
  "closure_prediction": false,
  "priority_probability": 0.7978,
  "priority_prediction": "High",
  "risk_score": 55,
  "risk_band": "High",
  "officers_required": 13,
  "barricades_required": 5,
  "diversion_required": false,
  "monitoring_priority": "P1",
  "shap_features": [],
  "reasoning": [
    "Moderate closure risk (26%) — monitor closely",
    "High-priority incident (79% confidence) — P1 response required",
    "Weekend peak hour — historically 2.3× higher incident impact",
    "Monsoon + active rain — waterlogging risk at low-lying junctions"
  ]
}
```

Full interactive docs for all endpoints are available at `/docs` (Swagger UI) once
the backend is running. For how the backend is laid out internally, see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).


## Deploy

- **Backend → Render:** New Web Service · root `backend` · start command `uvicorn main:app --host 0.0.0.0 --port $PORT` · set env vars in Render dashboard
- **Frontend → Vercel:** Import repo · root `frontend` · set `NEXT_PUBLIC_API_URL` to your Render backend URL

---

<div align="center">

**Namma Traffic** · Smarter Roads. Safer Journeys.  
BIT Mesra

</div>
