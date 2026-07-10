<div align="center">

<img src="docs/logo.png" alt="Namma AI" width="320" />

# Namma AI
### Smarter Roads. Safer Journeys.

**Traffic Intelligence Platform for Bengaluru**

<img src="docs/hero.png" alt="Namma Traffic Platform" width="100%" />

</div>

---

## Overview

Namma AI helps Bengaluru Traffic Police shift from reactive patrol to proactive, data-driven enforcement. It predicts incident severity and road-closure probability using a CatBoost ML model, recommends officer and barricade deployment, generates diversion routes, surfaces hotspots on a live heatmap, and lets citizens report incidents directly to authorities.

Next.js 14 · FastAPI · PostgreSQL · CatBoost

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, Leaflet (OpenStreetMap), Recharts |
| Backend | FastAPI, Pydantic v2, SQLAlchemy |
| Database | PostgreSQL |
| ML | CatBoost (closure probability + priority ranking), DBSCAN (hotspot clustering) |
| Routing | OSRM public server + custom diversion engine |
| Maps & weather | OpenStreetMap tiles, Open-Meteo API (both free, no key needed) |

---
<img width="1920" height="1080" alt="Why Do We Need Namma Traffic" src="https://github.com/user-attachments/assets/af969a8d-ab4b-4f88-a9b4-3bacce3e0c48" />

---

## Run Locally

### Prerequisites

- [Python 3.12+](https://www.python.org/downloads/) — tick "Add python.exe to PATH"
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
py -3.12 -m venv venv
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
cd frontend          # or: cd namma-traffic/frontend
npm install
npm run dev
```

Open **http://localhost:3000**

---

## Demo Flow

1. **Open** http://localhost:3000
2. **Seed data** — click "I'm an Authority" → log in (admin / admin123) → Dashboard → expand *Admin Tools* → click **Generate demo data**
3. **Citizen view** — go back to home → click "I'm a Citizen" → try Safe Route Finder and Live Heatmap
4. **Report an incident** — Citizen → Report Incident → fill form → submit → copy tracking ID
5. **Verify it** — Authority → Verify Reports → approve the report → watch it appear on the dashboard live
6. **Resource planning** — Authority → Deployment → see per-incident officer and barricade recommendations
7. **Diversion** — Authority → Diversion Plans → click "Diversion plan" on any incident

---

## Roles & Logins

| Role | How to access | Credentials |
|---|---|---|
| Citizen | Home → "I'm a Citizen" | No login needed |
| Traffic Personnel | Home → "I'm Traffic Personnel" | Register or use demo login |
| Authority | Home → "I'm an Authority" → Login | `admin` / `admin123` |

---

## Page Routes

| Route | Who | Description |
|---|---|---|
| `/` | Public | Landing + role selection |
| `/citizen/report` | Citizen | Submit incident report |
| `/citizen/heatmap` | Citizen | Live incident map + hotspots |
| `/citizen/route` | Citizen | Incident-aware safe route planner |
| `/authority/login` | Authority | JWT login |
| `/authority/dashboard` | Authority | Live KPIs + priority incidents |
| `/authority/predict` | Authority | ML closure probability + priority ranking |
| `/authority/analytics` | Authority | Incident trends (charts from live DB) |
| `/authority/resources` | Authority | Per-incident deployment recommendations |
| `/authority/diversion` | Authority | Auto-generated diversion routes |
| `/authority/verify` | Authority | Approve / reject citizen reports |

---

## Deploy

- **Backend → Render:** New Web Service · root `backend` · start command `uvicorn main:app --host 0.0.0.0 --port $PORT` · set env vars in Render dashboard
- **Frontend → Vercel:** Import repo · root `frontend` · set `NEXT_PUBLIC_API_URL` to your Render backend URL

---

<div align="center">

**Namma Traffic** · Smarter Roads. Safer Journeys.  
BIT Mesra

</div>
