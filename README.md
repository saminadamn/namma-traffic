<div align="center">

<img src="docs/logo.png" alt="Namma AI" width="320" />

# Namma AI
### Smarter Roads. Safer Journeys.

**AI-powered Traffic Intelligence Platform for Bengaluru**

<img src="docs/hero.png" alt="Namma AI Platform" width="100%" />

</div>

---

## Overview

Namma AI is a traffic intelligence platform that helps Bengaluru Traffic Police shift from reactive patrol to proactive, data-driven enforcement. It predicts event-related congestion, recommends resource deployment, surfaces incident hotspots on a live heatmap, and lets citizens report incidents directly to authorities.

Built for **Gridlock Hackathon 2.0** · Next.js frontend + FastAPI backend.

---

## Features

| Module | Who | What it does |
|---|---|---|
| **Landing + role selection** | Public | Choose citizen or authority |
| **Event prediction** | Authority | AI risk score (0–100) + officer/barricade recommendations + SHAP explainability |
| **Risk heatmap** | Both | Live incidents + historical hotspots on an interactive map |
| **Resource allocation** | Authority | Per-incident deployment plan (officers, barricades, radius) |
| **Verify reports** | Authority | Approve/reject citizen reports; approved ones flow to the live map |
| **Analytics** | Authority | Incident trends by cause, zone, and month |
| **Report incident** | Citizen | Submit category + location + photo, get a tracking ID |
| **Track report** | Citizen | Follow a report's status by tracking ID |

The backend ships with an **in-memory store pre-seeded with realistic Bengaluru data**, and ML predictions use a **fallback scorer** until you add trained models — so everything works on first run with no database or model setup.

---

## Run locally (Windows / PowerShell)

> **Prerequisites:** install [Python 3.12+](https://www.python.org/downloads/) (tick **"Add python.exe to PATH"** during install) and [Node.js LTS](https://nodejs.org). After installing, close and reopen PowerShell.
>
> Verify both are installed:
> ```powershell
> python --version
> node --version
> ```

You need **two PowerShell windows** open at the same time.

### Window 1 — Backend

```powershell
cd C:\Users\BIT\Downloads\namma-traffic\namma-traffic\backend
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload
```

> If you get *"running scripts is disabled on this system"*, run this once then retry the Activate line:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

Backend is live at **http://localhost:8000** · interactive API docs at **http://localhost:8000/docs**. Leave this window running.

### Window 2 — Frontend

```powershell
cd C:\Users\BIT\Downloads\namma-traffic\namma-traffic\frontend
npm install
copy .env.example .env.local
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Run locally (Mac / Linux)

```bash
# Terminal 1 — backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload

# Terminal 2 — frontend
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

---

## Demo flow (for judges)

The strongest end-to-end demo:

1. Open **http://localhost:3000** → click **I'm a citizen**
2. On the report page, submit an incident (category + location + description)
3. Copy the tracking ID shown on success
4. Go to **Authority → Verify reports**, find your report, click **Approve**
5. Open **Authority → Dashboard** and **Heatmap** — the approved incident now appears live

This shows the full loop: *citizen report → authority verification → live operations.*

---

## Page routes

| Route | Description |
|---|---|
| `/` | Landing + role selection |
| `/citizen/report` | Submit incident report |
| `/citizen/track` | Track report by ID |
| `/citizen/heatmap` | Live incident map |
| `/authority/dashboard` | KPIs + live incident feed |
| `/authority/predict` | Event risk prediction (ML + SHAP) |
| `/authority/heatmap` | Incident heatmap |
| `/authority/resources` | Deployment recommendations |
| `/authority/verify` | Approve citizen reports |
| `/authority/analytics` | Charts & trends |

---

## Tech stack

- **Frontend:** Next.js 14, Tailwind CSS, Recharts, Leaflet (OpenStreetMap — no API key)
- **Backend:** FastAPI, Pydantic
- **ML:** LightGBM + XGBoost ensemble, SHAP explainability
- **Maps & weather:** OpenStreetMap tiles, Open-Meteo forecast API (both free, keyless)

---

## Optional — plug in trained ML models

The backend runs with a rule-based fallback scorer out of the box. To use the real LightGBM + XGBoost ensemble:

1. Train models (use the `train_model.ipynb` notebook — same feature schema)
2. Drop `lgbm_model.pkl`, `xgb_model.pkl`, `tfidf.pkl` into `backend/models/`
3. Restart the backend — it auto-detects and loads them, switching to real predictions with SHAP explanations

### A note on model integrity

This project deliberately avoids **data leakage**. Fields like `veh_type` (100% null for active events) and `status` are only filled *after* an officer arrives, so they cannot be used at prediction time. Using them inflates the score to a meaningless 0.9967 AUC. The deployable model uses only pre-event features and scores an honest **0.7841 AUC** — real-world valid and defensible before domain experts.

---

## Deploy

- **Backend → Render:** New Web Service, root `backend`, start command `uvicorn main:app --host 0.0.0.0 --port $PORT`. Set an Uptime Robot ping on `/health` every 14 min (free tier sleeps).
- **Frontend → Vercel:** import repo, root `frontend`, set `NEXT_PUBLIC_API_URL` to your Render URL.

---

<div align="center">

**Namma AI** · Smarter Roads. Safer Journeys.
Bengaluru Traffic Police · Gridlock Hackathon 2.0

</div>
