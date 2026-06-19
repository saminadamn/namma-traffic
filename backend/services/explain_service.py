"""
Feature 1 — Explainable AI.

Deliberately does NOT re-derive the score with a second formula. It
calls into services/model_service.py's actual scoring path (the same
_fallback_breakdown() that /api/predict's _fallback() now also uses, and
the same SHAP path when real models are loaded) so the explanation can
never drift out of sync with the number an officer already saw on the
predict screen.

CONFIDENCE SCORE — read before changing: this is a heuristic data-
coverage confidence ("how much historical data backs this specific
corridor/zone/event combination"), not a statistically calibrated model
confidence. A calibrated confidence interval would require a real
trained model with isotonic/Platt calibration — out of scope here since
no trained model is shipped in this repo (see model_service.py's
fallback). When real models ARE loaded, confidence instead reflects
ensemble agreement between LightGBM and XGBoost, which is a real,
defensible uncertainty signal (the two models disagreeing is a genuine
reason to trust the prediction less).
"""
import math

from services.model_service import (
    CORRIDOR_HISTORY, EVENT_TYPE_HISTORY, ZONE_HISTORY, _fallback_breakdown,
)

FACTOR_LABELS = {
    "baseline": "Baseline Risk",
    "event_type": "Event Type History",
    "corridor_history": "Corridor History",
    "peak_hour": "Peak Hour",
    "weekend": "Weekend Effect",
    "rainfall": "Rainfall",
}


def _heuristic_confidence(ev) -> int:
    confidence = 60
    if ev.corridor in CORRIDOR_HISTORY:
        confidence += 10
    if ev.zone in ZONE_HISTORY:
        confidence += 8
    if ev.event_type in EVENT_TYPE_HISTORY:
        confidence += 12
    return min(confidence, 95)


def _ensemble_confidence(lgbm_p: float, xgb_p: float) -> int:
    """Used only when real models are loaded — agreement between the two
    ensemble members as an uncertainty proxy. Wide disagreement = lower
    confidence, even if both individually look certain."""
    disagreement = abs(lgbm_p - xgb_p)
    return max(50, round(95 - disagreement * 100))


def explain(model_service, ev) -> dict:
    if model_service.is_loaded:
        X = model_service._features(ev)
        lgbm_p = float(model_service.lgbm.predict_proba(X)[0][1])
        xgb_p = float(model_service.xgb.predict_proba(X)[0][1])
        score = int((0.55 * lgbm_p + 0.45 * xgb_p) * 100)
        sv = model_service.explainer.shap_values(X)
        sv = sv[1] if isinstance(sv, list) else sv
        shap_arr = sv[0]
        factors = []
        total_abs = sum(abs(float(v)) for v in shap_arr) or 1.0
        for i, name in enumerate(model_service._features(ev).columns):
            v = float(shap_arr[i])
            factors.append({
                "factor": name.replace("_", " ").title(),
                "contribution_pct": round(abs(v) / total_abs * 100, 1),
                "direction": "increases_risk" if v > 0 else "decreases_risk",
            })
        factors.sort(key=lambda f: f["contribution_pct"], reverse=True)
        confidence = _ensemble_confidence(lgbm_p, xgb_p)
        method = "shap_tree_explainer"
    else:
        breakdown = _fallback_breakdown(ev)
        raw_total = sum(breakdown.values()) or 1
        score = min(raw_total, 100)
        factors = [
            {
                "factor": FACTOR_LABELS[name],
                "contribution_pct": round(value / raw_total * 100, 1),
                "direction": "increases_risk" if value > 0 else "no_effect",
            }
            for name, value in breakdown.items() if value > 0
        ]
        factors.sort(key=lambda f: f["contribution_pct"], reverse=True)
        confidence = _heuristic_confidence(ev)
        method = "rule_based_heuristic"

    return {
        "congestion_risk_pct": score,
        "contributing_factors": factors[:6],
        "confidence_pct": confidence,
        "explanation_method": method,
    }
