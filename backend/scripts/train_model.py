"""
Train XGBoost + CatBoost road-closure risk classifiers on synthetic
Bengaluru traffic data and save the .pkl files that model_service.py
expects at startup.

Run from the backend/ directory:
    python scripts/train_model.py

Outputs:
    models/catboost_model.pkl
    models/xgb_model.pkl
    models/tfidf.pkl
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pandas as pd
import joblib

from services.model_service import (
    CORRIDOR_HISTORY,
    ZONE_HISTORY,
    EVENT_TYPE_HISTORY,
    CLEAN_FEATURES,
)

CORRIDORS  = list(CORRIDOR_HISTORY.keys())
ZONES      = list(ZONE_HISTORY.keys())
EVENT_TYPES = list(EVENT_TYPE_HISTORY.keys())

LAT_MIN, LAT_MAX = 12.85, 13.10
LON_MIN, LON_MAX = 77.45, 77.75
PEAK_HOURS    = {7, 8, 9, 17, 18, 19, 20, 21}
NIGHT_HOURS   = {22, 23, 0, 1, 2, 3, 4, 5}
MONSOON_MONTHS = {6, 7, 8, 9}

_emap = {k: i for i, k in enumerate(EVENT_TYPE_HISTORY)}
_cmap = {k: i for i, k in enumerate(CORRIDOR_HISTORY)}
_zmap = {k: i for i, k in enumerate(ZONE_HISTORY)}


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _make_row(rng: np.random.Generator) -> dict:
    event_type = EVENT_TYPES[rng.integers(len(EVENT_TYPES))]
    corridor   = CORRIDORS[rng.integers(len(CORRIDORS))]
    zone       = ZONES[rng.integers(len(ZONES))]

    hour  = int(rng.integers(0, 24))
    dow   = int(rng.integers(0, 7))
    month = int(rng.integers(1, 13))

    is_weekend = int(dow >= 5)
    is_peak    = int(hour in PEAK_HOURS)
    is_night   = int(hour in NIGHT_HOURS)

    lat = float(rng.uniform(LAT_MIN, LAT_MAX))
    lon = float(rng.uniform(LON_MIN, LON_MAX))

    er, ec = EVENT_TYPE_HISTORY[event_type]
    cr, cc = CORRIDOR_HISTORY[corridor]
    zr, zc = ZONE_HISTORY[zone]

    # Raw score: event type is the dominant predictor (~55%), corridor
    # adds ~25%, zone ~10%, time factors ~10%.
    raw = (
        0.55 * er
        + 0.25 * cr
        + 0.10 * zr
        + 0.05 * is_peak
        + 0.03 * is_weekend
        + 0.04 * int(month in MONSOON_MONTHS)
        + 0.03 * (1 - is_night)   # night events less likely to close roads
    )

    # Sigmoid with slope=9 centred at 0.38 creates a steep decision
    # boundary that gives the model a learnable signal while keeping
    # synthetic noise realistic.  Without this, the noisy threshold at
    # 50% gives the models nothing to learn and accuracy falls below the
    # majority-class baseline.
    prob = _sigmoid(9.0 * (raw - 0.38))
    prob = float(np.clip(prob, 0.02, 0.98))
    label = int(rng.random() < prob)

    return {
        "hour": hour, "dow": dow, "month": month,
        "is_weekend": is_weekend, "is_peak": is_peak, "is_night": is_night,
        "latitude": lat, "longitude": lon,
        "hist_closure_corridor": cr, "hist_count_corridor": cc,
        "hist_closure_zone":    zr, "hist_count_zone":    zc,
        "hist_closure_event_type": er, "hist_count_event_type": ec,
        "event_type_enc": _emap[event_type],
        "corridor_enc":   _cmap[corridor],
        "zone_enc":       _zmap[zone],
        "requires_road_closure": label,
    }


def generate_dataset(n: int = 20_000) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    return pd.DataFrame([_make_row(rng) for _ in range(n)])


_TRAFFIC_CORPUS = [
    "accident hosur road multiple vehicles road closure required diversion",
    "waterlogging silk board junction traffic blocked monsoon flooding",
    "vip movement mg road full closure security diversion required",
    "tree fall outer ring road lanes blocked debris clearance",
    "protest march town hall road blocked diversion required police",
    "public event lalbagh flower show traffic congestion road closure",
    "construction bellary road lane narrowing signal disruption",
    "vehicle breakdown nh44 heavy vehicle blocking lane towing required",
    "debris kanakapura road clearance required emergency services",
    "procession basavanagudi road blocked devotees march police escort",
    "accident whitefield road ambulance hospital nearby priority clearance",
    "waterlogging sarjapura road low lying flood risk heavy rain",
    "signal failure koramangala junction manual traffic control required",
    "heavy rain ORR north surface flooding diversion advised alternate route",
    "emergency road closure bannerghatta road utility maintenance work",
    "traffic congestion electronic city peak hour slow movement bottleneck",
    "roadblock hebbal flyover maintenance night closure alternate route",
    "accident expressway tumkur road multiple vehicles traffic jam closure",
    "vip convoy airport road high security movement full closure",
    "festival procession old airport road road closed devotees crowd",
    "tree uprooted storm indiranagar road blocked emergency clearance",
    "fire brigade call koramangala road blocked emergency vehicles priority",
    "marathon race mg road closed morning event diversion active",
    "building collapse debris old city road blocked rescue operation",
    "gas leak hsr layout road sealed emergency services deployed",
]


def train():
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import roc_auc_score, accuracy_score, f1_score
    from sklearn.feature_extraction.text import TfidfVectorizer
    from xgboost import XGBClassifier
    from catboost import CatBoostClassifier

    print("Generating synthetic dataset (20 000 rows)...")
    df = generate_dataset(20_000)
    pos_rate = df["requires_road_closure"].mean()
    print(f"  positive rate = {pos_rate:.1%}   (majority-class baseline = {max(pos_rate, 1-pos_rate):.1%})")

    X = df[CLEAN_FEATURES]
    y = df["requires_road_closure"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # ── CatBoost ────────────────────────────────────────────────────────────
    print("\nTraining CatBoost...")
    cb = CatBoostClassifier(
        iterations=500,
        depth=7,
        learning_rate=0.06,
        l2_leaf_reg=3,
        bagging_temperature=0.5,
        random_strength=1.0,
        border_count=128,
        auto_class_weights="Balanced",
        eval_metric="AUC",
        random_seed=42,
        verbose=0,
    )
    cb.fit(X_train, y_train, eval_set=(X_test, y_test))
    cb_proba = cb.predict_proba(X_test)[:, 1]
    cb_pred  = cb.predict(X_test)
    print(f"  CatBoost  AUC={roc_auc_score(y_test, cb_proba):.4f}  "
          f"acc={accuracy_score(y_test, cb_pred):.4f}  "
          f"F1={f1_score(y_test, cb_pred):.4f}")

    # ── XGBoost ─────────────────────────────────────────────────────────────
    print("\nTraining XGBoost...")
    neg, pos = (y_train == 0).sum(), (y_train == 1).sum()
    xgb = XGBClassifier(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.06,
        subsample=0.85,
        colsample_bytree=0.85,
        min_child_weight=3,
        gamma=0.1,
        reg_alpha=0.1,
        reg_lambda=1.5,
        scale_pos_weight=neg / max(pos, 1),
        eval_metric="auc",
        random_state=42,
        verbosity=0,
        early_stopping_rounds=30,
    )
    xgb.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )
    xgb_proba = xgb.predict_proba(X_test)[:, 1]
    xgb_pred  = xgb.predict(X_test)
    print(f"  XGBoost   AUC={roc_auc_score(y_test, xgb_proba):.4f}  "
          f"acc={accuracy_score(y_test, xgb_pred):.4f}  "
          f"F1={f1_score(y_test, xgb_pred):.4f}")

    # ── Ensemble (weighted average of probabilities) ─────────────────────────
    ens_proba = 0.55 * cb_proba + 0.45 * xgb_proba
    ens_pred  = (ens_proba >= 0.5).astype(int)
    print(f"\n  Ensemble  AUC={roc_auc_score(y_test, ens_proba):.4f}  "
          f"acc={accuracy_score(y_test, ens_pred):.4f}  "
          f"F1={f1_score(y_test, ens_pred):.4f}")

    # ── TF-IDF on traffic text corpus ────────────────────────────────────────
    print("\nFitting TF-IDF on traffic corpus...")
    tfidf = TfidfVectorizer(max_features=200, ngram_range=(1, 2))
    tfidf.fit(_TRAFFIC_CORPUS)
    print(f"  {len(tfidf.vocabulary_)} vocabulary terms")

    # ── Save ─────────────────────────────────────────────────────────────────
    out_dir = Path(__file__).parent.parent / "models"
    out_dir.mkdir(exist_ok=True)
    joblib.dump(cb,    out_dir / "catboost_model.pkl")
    joblib.dump(xgb,   out_dir / "xgb_model.pkl")
    joblib.dump(tfidf, out_dir / "tfidf.pkl")

    print(f"\nSaved to {out_dir.resolve()}")
    for name in ("catboost_model.pkl", "xgb_model.pkl", "tfidf.pkl"):
        kb = (out_dir / name).stat().st_size // 1024
        print(f"  {name:<24} {kb} KB")
    print("\nRestart uvicorn — model_loaded=True in startup log.")


if __name__ == "__main__":
    train()
