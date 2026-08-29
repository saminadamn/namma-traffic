# Namma AI — Backend Architecture

Orientation map for the backend: what each package owns, and which file to
open for a given feature. For how to run the project, see the [README](../README.md).

---

## Feature → file map

| Feature | Entry point | Core logic |
|---|---|---|
| Auth, RBAC, JWT | `routers/auth.py`, `routers/admin.py` | `services/auth_service.py`, `core/security.py`, `core/rbac.py` |
| Incidents & citizen reports | `routers/api.py` | `services/incident_service.py` |
| Real-time incident push | `routers/websocket.py` | `routers/websocket.py:manager` |
| Background jobs | `worker.py` | `services/arq_service.py` |
| Risk prediction (SHAP) | `routers/api.py:predict_router` | `services/model_service.py` |
| Closure & priority scoring | `routers/ml_predict.py` | `services/catboost_service.py` |
| Explainable AI | `routers/explain.py` | `services/explain_service.py` |
| Safe routing | `routers/routing.py` | `astram_routing/` |
| Diversion planning | `routers/diversion.py` | `diversion_engine/` |
| Multilingual advisory | `routers/advisory.py`, `routers/translate.py` | `services/advisory_service.py` |
| Dashboard analytics | `routers/api.py:analytics_router` | `services/incident_service.analytics_summary()` |
| What-if / simulation | `routers/whatif.py`, `routers/simulate.py` | `services/whatif_service.py`, `services/simulation_service.py` |
| Command center summary | `routers/command_center.py` | `services/command_center_service.py` |
| Resource recommendation | `routers/api.py` | `services/rules_engine.py`, `services/priority_service.py` |

---

## Package layout

```
backend/
├── main.py              FastAPI app: CORS, rate limiting, startup migrations, router mounting
├── worker.py            ARQ background worker (separate process from the API)
├── config.py            Single pydantic-settings Settings class; all env vars land here
├── core/                Cross-cutting infrastructure
│   ├── database.py        SQLAlchemy engine, SessionLocal, Base, get_db dependency
│   ├── security.py        Password hashing, JWT encode/decode
│   ├── rbac.py            Role/permission dependencies used by routers
│   └── redis_client.py    Optional Redis: token blacklist + response cache
├── routers/             HTTP layer only — parse, authorize, delegate, serialize
├── services/            Business logic; no FastAPI imports belong here
├── schemas/             Pydantic request/response shapes
├── db_models/           SQLAlchemy ORM models (named to avoid clashing with models/)
├── alembic/             Migrations
├── models/              Serialized .pkl ensemble consumed by model_service.py
├── ml_models/           Native .cbm models consumed by catboost_service.py
├── astram_routing/      OSRM-backed safe-route search
└── diversion_engine/    Road-network diversion planning (own config/models/services)
```

---

## Two ML pipelines — read this before touching either

The backend deliberately runs **two independent model pipelines**. They are
not duplicates and neither one is dead code:

| | `services/model_service.py` | `services/catboost_service.py` |
|---|---|---|
| Artifacts | `models/*.pkl` (joblib) | `ml_models/*.cbm` (native CatBoost) |
| Models | CatBoost + XGBoost ensemble, weights in `ENSEMBLE_WEIGHTS` | Separate closure and priority classifiers |
| Output | Risk score, band, SHAP factors, officer/barricade counts | Closure probability, priority probability |
| Serves | `/api/predict`, `/prediction/explain` | `/api/ml-predict`, inline scoring of citizen reports |
| If artifacts are missing | Falls back to `_fallback_breakdown()`, a transparent heuristic | Raises; caller handles |

`model_service.py` degrades silently to a heuristic when the `.pkl` files
cannot be loaded, so a healthy-looking `/api/predict` response does **not**
by itself prove the ensemble is live — check the startup log line
(`Prediction models loaded`) or `/health`.

---

## Conventions

- **Flat imports.** `from config import get_settings`, not
  `from backend.config import ...`. The app runs with `backend/` as the
  working directory; every module follows this.
- **`db_models/`, not `models/`.** `models/` was already taken by ML
  artifacts. See the docstring at the top of `db_models/user.py`.
- **Routers stay thin.** Business logic lives in `services/` so it can be
  tested without an HTTP client.
- **Schema safety net.** `main.py:_ensure_schema()` runs idempotent
  `ADD COLUMN IF NOT EXISTS` statements at startup so a partially-applied
  Alembic history can never leave the API serving 500s on a missing column.
