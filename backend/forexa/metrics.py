"""Verification metrics (MAE, RMSE, bias, correlation, rainfall contingency scores, Brier Score, circular wind)."""
from __future__ import annotations

import numpy as np
import pandas as pd

# Prototype rainfall thresholds for 6-hourly accumulation (NOT official IMD criteria)
RAIN_THRESHOLDS_6H = {"rain_2.5mm": 2.5, "heavy_20mm": 20.0, "extreme_50mm": 50.0}


def continuous(f: pd.Series, o: pd.Series) -> dict:
    m = f.notna() & o.notna()
    f, o = f[m].astype(float), o[m].astype(float)
    if len(f) < 2:
        return {"n": int(len(f)), "mae": None, "rmse": None, "bias": None, "corr": None}
    d = f - o
    corr = float(np.corrcoef(f, o)[0, 1]) if f.std() > 0 and o.std() > 0 else None
    return {
        "n": int(len(f)),
        "mae": round(float(d.abs().mean()), 4),
        "rmse": round(float(np.sqrt((d**2).mean())), 4),
        "bias": round(float(d.mean()), 4),
        "corr": round(corr, 4) if corr is not None else None,
    }


def contingency(f: pd.Series, o: pd.Series, thr: float) -> dict:
    m = f.notna() & o.notna()
    fy, oy = f[m] >= thr, o[m] >= thr
    hits = int((fy & oy).sum())
    miss = int((~fy & oy).sum())
    fa = int((fy & ~oy).sum())
    cn = int((~fy & ~oy).sum())
    pod = round(hits / (hits + miss), 4) if hits + miss else None
    far = round(fa / (hits + fa), 4) if hits + fa else None
    csi = round(hits / (hits + miss + fa), 4) if hits + miss + fa else None
    return {
        "hits": hits, "misses": miss, "false_alarms": fa, "correct_neg": cn,
        "pod": pod, "far": far, "csi": csi,
    }


def brier_score(prob_pct: pd.Series, o_precip: pd.Series, thr: float = 2.5) -> float | None:
    """Brier Score = mean((p - y)^2) where p in [0, 1] and y = I(obs_precip >= thr)."""
    m = prob_pct.notna() & o_precip.notna()
    if m.sum() == 0:
        return None
    p = (prob_pct[m].astype(float) / 100.0).clip(0.0, 1.0)
    y = (o_precip[m].astype(float) >= thr).astype(float)
    return round(float(((p - y) ** 2).mean()), 4)


def rainfall_scores(f: pd.Series, o: pd.Series, prob_pct: pd.Series | None = None) -> dict:
    out = {k: contingency(f, o, t) for k, t in RAIN_THRESHOLDS_6H.items()}
    if prob_pct is not None:
        out["brier_score_2.5mm"] = brier_score(prob_pct, o, 2.5)
    return out


def circular_wind_dir_blend(angles_deg: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Circular weighted average of wind direction in degrees [0, 360).

    angles_deg: shape (N, M) in degrees
    weights: shape (N, M) nonnegative summing to 1
    Returns shape (N,) in [0, 360) or NaN where all angles are NaN.
    """
    valid = ~np.isnan(angles_deg) & (weights > 0)
    w = np.where(valid, weights, 0.0)
    w_sum = w.sum(axis=1, keepdims=True)
    w_norm = np.divide(w, w_sum, out=np.zeros_like(w), where=w_sum > 0)
    rad = np.deg2rad(np.nan_to_num(angles_deg, nan=0.0))
    sin_mean = (w_norm * np.sin(rad)).sum(axis=1)
    cos_mean = (w_norm * np.cos(rad)).sum(axis=1)
    ang = (np.rad2deg(np.arctan2(sin_mean, cos_mean)) + 360.0) % 360.0
    return np.where(w_sum[:, 0] > 0, ang.round(2), np.nan)
