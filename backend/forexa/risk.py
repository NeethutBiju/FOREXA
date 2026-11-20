"""FOREXA Risk Classification, Transparent Extreme Weather Event Identification,
Historical Analogue Search, Early Warnings & Continuous Learning Feedback (Stages 5, 8, 10).
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from . import config, engine, ingestion, storage

# Configurable meteorological thresholds (Transparent rule-based detection)
RISK_THRESHOLDS = {
    "precip_6h_mm": {
        "WATCH": 15.0,          # Moderate-Heavy rain watch
        "HEAVY": 20.0,          # Heavy rainfall
        "WARNING": 35.0,        # Very heavy rainfall
        "SEVERE": 50.0,         # Extremely heavy rainfall
    },
    "wind_ms": {
        "WATCH": 9.0,
        "HIGH_WIND": 10.5,
        "WARNING": 13.0,
        "SEVERE": 16.5,
    },
    "pressure_hpa": {
        "CYCLONIC_LOW": 1002.5,
    },
    "temp_c": {
        "HEATWAVE": 36.0,
    },
}

PREPAREDNESS_ACTIONS = {
    "SAFE": [
        "Normal monitoring of district weather advisories.",
        "No special disaster-response mobilization required.",
    ],
    "WATCH": [
        "Keep district emergency operation centres (DEOC) on standby.",
        "Monitor low-lying and urban waterlogging hotspots.",
        "Advise fishermen and high-range travellers to stay updated.",
    ],
    "WARNING": [
        "Activate district control rooms and alert local panchayats / wards.",
        "Inspect river embankments, drainage channels, and high-range Ghats slopes.",
        "Restrict night travel in high-range roads and advise coastal vigilance.",
    ],
    "SEVERE": [
        "Pre-position NDRF / SDRF teams and open relief camps in vulnerable taluks.",
        "Enforce strict travel and fishing advisories; prepare evacuation in flood/landslide risk zones.",
        "Maintain continuous coordination with KSDMA and district authorities.",
    ],
}

RISK_TO_UI_SEVERITY = {
    "SEVERE": "RED",
    "WARNING": "ORANGE",
    "WATCH": "YELLOW",
    "SAFE": "GREEN",
    "UNMONITORED": "GREEN",
    "UNKNOWN": "GREEN",
}


def classify_risk_and_extremes(df: pd.DataFrame, thresholds: dict = RISK_THRESHOLDS) -> pd.DataFrame:
    """Classify each blended forecast row into SAFE / WATCH / WARNING / SEVERE and transparent meteorological event type."""
    if df is None or len(df) == 0:
        return pd.DataFrame()
    out = df.copy()
    p = out["precip_6h_mm__blend"].fillna(0.0)
    w = out["wind_ms__blend"].fillna(0.0)
    pr = out["pressure_hpa__blend"].fillna(1010.0)
    t = out["temp_c__blend"].fillna(27.0)
    pt = thresholds["precip_6h_mm"]
    wt = thresholds["wind_ms"]
    prt = thresholds["pressure_hpa"]["CYCLONIC_LOW"]
    tt = thresholds["temp_c"]["HEATWAVE"]

    cond_str = out.get("obs_condition", pd.Series("", index=out.index)).fillna("").astype(str)

    # Transparent rule-based meteorological event classification
    hazard = np.select(
        [
            (w >= wt["WARNING"]) & (pr <= prt),
            p >= pt["SEVERE"],
            p >= pt["WARNING"],
            ((p >= pt["WATCH"]) & (w >= 9.5)) | (cond_str == "Thunderstorm / Squall"),
            p >= pt["HEAVY"],
            w >= wt["HIGH_WIND"],
            (t >= tt) & (p < 1.0),
            p >= pt["WATCH"],
        ],
        [
            "Cyclonic System / Low-Pressure Gale",
            "Extremely Heavy Rainfall",
            "Very Heavy Rainfall",
            "Thunderstorms and Lightning",
            "Heavy Rainfall",
            "High Winds",
            "Heatwave Conditions",
            "Prolonged / Moderate-Heavy Rainfall",
        ],
        default="Normal Weather",
    )

    risk_cat = np.select(
        [
            (p >= pt["SEVERE"]) | (w >= wt["SEVERE"]) | ((w >= wt["WARNING"]) & (pr <= prt)),
            (p >= pt["WARNING"]) | (w >= wt["WARNING"]),
            (p >= pt["WATCH"]) | (w >= wt["WATCH"]) | ((t >= tt) & (p < 1.0)),
        ],
        ["SEVERE", "WARNING", "WATCH"],
        default="SAFE",
    )
    if "status" in out.columns:
        risk_cat = np.where(out["status"] == "UNAVAILABLE", "UNKNOWN", risk_cat)
        hazard = np.where(out["status"] == "UNAVAILABLE", "Unavailable (No Active Forecast Source)", hazard)

    out["hazard_type"] = hazard
    out["risk_category"] = risk_cat
    out["ui_severity"] = pd.Series(risk_cat, index=out.index).map(RISK_TO_UI_SEVERITY).fillna("GREEN")
    return out


def build_extreme_event_detail(row: pd.Series | dict) -> dict:
    """Section 4: Transparent extreme weather event identification separating meteorological events from possible impacts."""
    d = str(row.get("district", ""))
    meta = config.DISTRICT_METADATA.get(d, {})
    status = str(row.get("status", "OK"))
    if status in ("UNAVAILABLE", "NO_SENSOR_FEED") or pd.isna(row.get("precip_6h_mm__blend")):
        return {
            "detection_method": "Transparent Rule-Based Meteorological Detector (Not XGBoost)",
            "meteorological_event_type": "Unavailable",
            "detected_meteorological_events": [],
            "possible_impacts": [],
            "affected_district": d,
            "expected_onset": "Unavailable",
            "duration_hours": None,
            "intensity": None,
            "severity": "UNAVAILABLE",
            "ui_severity": "GREEN",
            "confidence": "LOW",
            "supporting_forecast_variables": None,
            "unavailable_variables_in_dataset": [
                "wind_gust_ms",
                "wind_dir_deg",
                "lightning_flash_rate",
                "cyclone_track_coordinates",
                "river_dam_gauge_level",
            ],
        }

    p = float(row.get("precip_6h_mm__blend", 0.0))
    w = float(row.get("wind_ms__blend", 0.0))
    pr = float(row.get("pressure_hpa__blend", 1010.0))
    t = float(row.get("temp_c__blend", 27.0))
    h = float(row.get("humidity_pct__blend", 80.0))
    lead_h = int(row.get("lead_h", 24))
    elev_m = float(meta.get("elev_m", 10))
    zone = str(meta.get("zone", ""))
    is_coastal = "Coastal" in zone
    is_high_range = elev_m >= 300.0 or "High Range" in zone

    # 1. Detect Meteorological Events (Strictly from forecast variables)
    met_events: list[str] = []
    if w >= 13.0 and pr <= 1002.5:
        met_events.append("Cyclonic systems (High wind >= 13 m/s & Low pressure <= 1002.5 hPa)")
    if p >= 50.0:
        met_events.append("Extremely heavy rainfall (>= 50 mm / 6h)")
    elif p >= 35.0:
        met_events.append("Very heavy rainfall (35–50 mm / 6h)")
    elif p >= 20.0:
        met_events.append("Heavy rainfall (20–35 mm / 6h)")
    elif p >= 15.0:
        met_events.append("Prolonged / Moderate-heavy rainfall (15–20 mm / 6h)")

    if (p >= 15.0 and w >= 9.5) or str(row.get("live_event_type", "")) == "THUNDERSTORM_SQUALL":
        met_events.append("Thunderstorms and squall conditions")
    if w >= 10.5:
        met_events.append("High sustained winds (>= 10.5 m/s)")
    if t >= 36.0 and p < 1.0:
        met_events.append("Heatwave conditions (>= 36 °C)")

    if not met_events:
        met_events.append("Normal weather conditions")

    # 2. Distinguish Possible Secondary Impacts (Rule-derived susceptibility, not direct hydrological sensor predictions)
    possible_impacts: list[str] = []
    if p >= 35.0:
        possible_impacts.append("Flood risk (low-lying & riverine waterlogging susceptibility from >= 35 mm/6h rain)")
    elif p >= 20.0:
        possible_impacts.append("Localized urban/low-lying waterlogging possible")

    if is_high_range and p >= 30.0:
        possible_impacts.append(f"Landslide risk (High-range terrain elevation {int(elev_m)}m with heavy rainfall)")
    if is_coastal and ((w >= 11.5 and pr <= 1003.0) or w >= 13.5):
        possible_impacts.append("Storm surge and coastal flooding risk (Coastal zone with strong onshore wind & low pressure)")
    if w >= 11.0:
        possible_impacts.append("High-wind tree/power-line disruption risk")

    risk_cat = str(row.get("risk_category", "SAFE"))
    ui_sev = RISK_TO_UI_SEVERITY.get(risk_cat, "GREEN")

    return {
        "detection_method": "Transparent Rule-Based Meteorological Detector (XGBoost model predicts source reliability weights only)",
        "meteorological_event_type": str(row.get("hazard_type", "Normal Weather")),
        "detected_meteorological_events": met_events,
        "possible_impacts": possible_impacts,
        "impact_distinction_note": (
            "Meteorological events are detected directly from blended forecast variables (precip_6h_mm, wind_ms, pressure_hpa, temp_c). "
            "Possible impacts (flood, landslide, storm surge) are terrain-susceptibility indicators, not hydrological model outputs."
        ),
        "affected_district": d,
        "expected_onset": f"+{lead_h}h ({row.get('valid_time', '')})",
        "duration_hours": 6,
        "intensity": {
            "rainfall_6h_mm": round(p, 2),
            "rainfall_rate_mm_per_h": round(p / 6.0, 2),
            "wind_speed_ms": round(w, 2),
            "wind_speed_kmh": round(w * 3.6, 1),
            "pressure_hpa": round(pr, 1),
            "temperature_c": round(t, 2),
        },
        "severity": risk_cat,
        "ui_severity": ui_sev,
        "confidence": str(row.get("confidence", "MEDIUM")),
        "supporting_forecast_variables": {
            "precip_6h_mm": round(p, 2),
            "temp_c": round(t, 2),
            "humidity_pct": round(h, 1),
            "wind_ms": round(w, 2),
            "pressure_hpa": round(pr, 1),
            "ensemble_precip_prob_pct": (
                round(float(row["precip_prob_pct"]), 1) if pd.notna(row.get("precip_prob_pct")) else None
            ),
            "ensemble_precip_spread_mm": (
                round(float(row["precip_spread_mm"]), 2) if pd.notna(row.get("precip_spread_mm")) else None
            ),
        },
        "unavailable_variables_in_dataset": [
            "wind_gust_ms (Unavailable in source CSVs)",
            "wind_dir_deg (Unavailable in source CSVs)",
            "cyclone_track_coordinates (Unavailable in source CSVs)",
            "dam_reservoir_storage_level (Unavailable in source CSVs)",
        ],
    }


# ------------------------------------ Historical Rainfall Event Comparison (Verified Dataset Only)
def search_historical_analogues(
    district: str,
    rain_mm: float,
    duration_h: int = 6,
    top_k: int = 5,
    season_filter: str | None = None,
    years_range: int = 10,
    same_district_only: bool = True,
) -> list[dict]:
    """Find similar verified historical rainfall observations from the 2021–2025 dataset (zero fabricated impacts)."""
    obs = ingestion.load_clean("observations")
    if obs is None or len(obs) == 0:
        return []

    blended_df = storage.read_table("blended")

    cutoff_year = 2025 - int(years_range) + 1
    obs = obs.copy()
    obs["obs_year"] = obs["valid_time"].dt.tz_convert("Asia/Kolkata").dt.year
    obs = obs[obs["obs_year"] >= cutoff_year]

    if same_district_only:
        sub = obs[obs["district"] == district].sort_values("valid_time").copy()
    else:
        sub = obs.sort_values("valid_time").copy()

    if len(sub) == 0:
        return []

    if duration_h <= 6:
        scale_factor = duration_h / 6.0
        sub["event_rain_mm"] = (sub["precip_6h_mm"] * scale_factor).round(2)
    else:
        steps = max(1, duration_h // 6)
        sub["event_rain_mm"] = (
            sub.groupby("district")["precip_6h_mm"]
            .transform(lambda s: s.rolling(steps, min_periods=1).sum())
            .round(2)
        )

    if rain_mm > 1.0:
        sub = sub[sub["event_rain_mm"] > 0.5].copy()
    if len(sub) == 0:
        return []

    rel_diff = (sub["event_rain_mm"] - rain_mm).abs() / max(rain_mm, 5.0)
    sim = 100.0 * np.exp(-1.5 * rel_diff)
    if season_filter and "season" in sub.columns:
        sim = np.where(sub["season"] == season_filter, np.minimum(100.0, sim + 4.0), sim - 4.0)
    if not same_district_only:
        sim = np.where(sub["district"] == district, np.minimum(100.0, sim + 5.0), sim)
    sub["similarity_score"] = np.clip(sim, 0.0, 100.0).round(1)

    sub["date_str"] = sub["valid_time"].dt.tz_convert("Asia/Kolkata").dt.strftime("%Y-%m-%d")
    best_per_day = (
        sub.sort_values("similarity_score", ascending=False)
        .drop_duplicates(subset=["district", "date_str"])
        .head(top_k)
    )

    out = []
    for _, row in best_per_day.iterrows():
        vt = row["valid_time"]
        row_dist = str(row["district"])
        win = obs[
            (obs["district"] == row_dist)
            & (obs["valid_time"] >= vt - pd.Timedelta(hours=18))
            & (obs["valid_time"] <= vt + pd.Timedelta(hours=18))
        ].sort_values("valid_time")

        # Look up actual model performance at that timestamp from blended table if available
        retro_perf = None
        if blended_df is not None:
            m_rows = blended_df[(blended_df["district"] == row_dist) & (blended_df["valid_time"] == vt) & (blended_df["lead_h"] == 24)]
            if len(m_rows) > 0:
                mr = m_rows.iloc[0]
                obs_p = float(row["precip_6h_mm"])
                nwp_p = float(mr["precip_6h_mm__nwp"]) if pd.notna(mr.get("precip_6h_mm__nwp")) else None
                ai_p = float(mr["precip_6h_mm__ai"]) if pd.notna(mr.get("precip_6h_mm__ai")) else None
                ens_p = float(mr["precip_6h_mm__ensemble"]) if pd.notna(mr.get("precip_6h_mm__ensemble")) else None
                bl_p = float(mr["precip_6h_mm__blend"]) if pd.notna(mr.get("precip_6h_mm__blend")) else None
                w_map = {
                    "NWP": round(float(mr.get("eff_w_nwp", 0.0)) * 100.0, 1),
                    "AI": round(float(mr.get("eff_w_ai", 0.0)) * 100.0, 1),
                    "Ensemble": round(float(mr.get("eff_w_ensemble", 0.0)) * 100.0, 1),
                }
                top_m = max(w_map, key=w_map.get)
                retro_perf = {
                    "lead_h": 24,
                    "observed_precip_6h_mm": round(obs_p, 2),
                    "blended_forecast_6h_mm": round(bl_p, 2) if bl_p is not None else None,
                    "nwp_forecast_6h_mm": round(nwp_p, 2) if nwp_p is not None else None,
                    "ai_forecast_6h_mm": round(ai_p, 2) if ai_p is not None else None,
                    "ensemble_forecast_6h_mm": round(ens_p, 2) if ens_p is not None else None,
                    "nwp_error_mm": round(abs(nwp_p - obs_p), 2) if nwp_p is not None else None,
                    "ai_error_mm": round(abs(ai_p - obs_p), 2) if ai_p is not None else None,
                    "ensemble_error_mm": round(abs(ens_p - obs_p), 2) if ens_p is not None else None,
                    "blended_error_mm": round(abs(bl_p - obs_p), 2) if bl_p is not None else None,
                    "weights_pct": w_map,
                    "highest_weighted_model": f"{top_m} ({w_map[top_m]}%)",
                }

        out.append({
            "district": row_dist,
            "event_timestamp_ist": str(row.get("valid_time_ist", vt)),
            "date": row["date_str"],
            "year": int(vt.tz_convert("Asia/Kolkata").year),
            "season": str(row.get("season", "")),
            "recorded_rainfall_mm": float(row["event_rain_mm"]),
            "precip_6h_mm": float(row["precip_6h_mm"]),
            "duration_h": int(duration_h),
            "weather_condition": str(row.get("condition", "")),
            "extreme_event_class": str(row.get("event_type", "NORMAL_WEATHER")),
            "temp_c": float(row["temp_c"]),
            "wind_ms": round(float(row["wind_ms"]), 2),
            "pressure_hpa": round(float(row["pressure_hpa"]), 1) if pd.notna(row.get("pressure_hpa")) else None,
            "similarity_score": float(row["similarity_score"]),
            "retrospective_model_performance": retro_perf,
            "recorded_ground_impacts": "Unavailable in dataset (only meteorological observation values are recorded)",
            "is_synthetic": True,
            "data_provenance": "kerala_actual_observations_2021_2025.csv (Verified Synthetic Benchmark Record)",
            "impact_disclaimer": (
                "Matched strictly on observed meteorological records in the 2021–2025 dataset. "
                "Ground casualty or damage logs are not included in the dataset and are never fabricated."
            ),
            "series_36h": [
                {"time_ist": str(r.get("valid_time_ist", r["valid_time"])), "precip_6h_mm": round(float(r["precip_6h_mm"]), 2)}
                for _, r in win.iterrows()
            ],
        })
    return out


# ------------------------------------ Early Warning & Alert Lifecycle
def generate_alerts_for_cycle(cycle_df: pd.DataFrame) -> list[dict]:
    """Generate or update decision-support early warnings for WATCH / WARNING / SEVERE district forecasts."""
    classified = classify_risk_and_extremes(cycle_df)
    existing = storage.get_kv("alerts", [])
    existing_by_key = {(a["district"], a["expected_event_time"], a["lead_h"]): a for a in existing}

    now_iso = datetime.now(timezone.utc).isoformat()
    new_or_updated = []

    for _, r in classified.iterrows():
        risk_cat = r["risk_category"]
        key = (str(r["district"]), str(r["valid_time"]), int(r["lead_h"]))
        if risk_cat in ("WATCH", "WARNING", "SEVERE"):
            rain = round(float(r["precip_6h_mm__blend"]), 2)
            wind = round(float(r["wind_ms__blend"]), 2)
            pmode = r.get("priority_mode", "NORMAL_ADAPTIVE")
            reason = (
                f"{r['hazard_type']} detected for {r['district']} at +{int(r['lead_h'])}h lead ({pmode}): "
                f"blended 6h rainfall = {rain} mm, wind = {wind} m/s "
                f"(Unified Weights: NWP={r['eff_w_nwp']:.2f}, Ens={r['eff_w_ensemble']:.2f}, AI={r['eff_w_ai']:.2f})."
            )
            if key in existing_by_key:
                alert = existing_by_key[key]
                if alert["risk_category"] != risk_cat or abs(alert["forecast_rainfall_mm"] - rain) > 1.0:
                    alert.update({
                        "forecast_rainfall_mm": rain,
                        "wind_ms": wind,
                        "risk_category": risk_cat,
                        "ui_severity": RISK_TO_UI_SEVERITY.get(risk_cat, "YELLOW"),
                        "hazard_type": r["hazard_type"],
                        "reason": reason,
                        "confidence": r["confidence"],
                        "recommended_actions": PREPAREDNESS_ACTIONS.get(risk_cat, []),
                        "status": "UPDATED",
                        "updated_at": now_iso,
                    })
                new_or_updated.append(alert)
            else:
                alert = {
                    "alert_id": f"AL-{uuid.uuid4().hex[:8].upper()}",
                    "district": str(r["district"]),
                    "district_id": str(r.get("district_id", "")),
                    "forecast_issue_time": str(r["init_time"]),
                    "expected_event_time": str(r["valid_time"]),
                    "lead_h": int(r["lead_h"]),
                    "forecast_rainfall_mm": rain,
                    "wind_ms": wind,
                    "forecast_duration_h": 6,
                    "risk_category": risk_cat,
                    "ui_severity": RISK_TO_UI_SEVERITY.get(risk_cat, "YELLOW"),
                    "hazard_type": r["hazard_type"],
                    "reason": reason,
                    "confidence": str(r["confidence"]),
                    "recommended_actions": PREPAREDNESS_ACTIONS.get(risk_cat, []),
                    "valid_until": str(pd.Timestamp(r["valid_time"]) + pd.Timedelta(hours=6)),
                    "status": "ACTIVE",
                    "prototype_disclaimer": "PROTOTYPE DECISION-SUPPORT ALERT — NOT AN OFFICIAL IMD OR KSDMA GOVERNMENT WARNING.",
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
                existing_by_key[key] = alert
                new_or_updated.append(alert)
        elif key in existing_by_key and existing_by_key[key]["status"] in ("ACTIVE", "UPDATED"):
            existing_by_key[key]["status"] = "RESOLVED"
            existing_by_key[key]["updated_at"] = now_iso

    all_alerts = sorted(existing_by_key.values(), key=lambda x: x["expected_event_time"], reverse=True)
    storage.put_kv("alerts", all_alerts[:500])
    return new_or_updated


# ------------------------------------ Stage 8: Continuous Learning & Feedback Pipeline
def sync_forecast_feedback_ledger(sample_cycles: int = 8) -> dict:
    """Section 8: Store forecasts in forecast_feedback_ledger, match matured valid_times with reference observations,
    calculate source-wise and blended errors, and update verification records.
    """
    df = storage.read_table("blended")
    if df is None or len(df) == 0:
        return {"stored": 0, "verified": 0}

    classified = classify_risk_and_extremes(df)
    recent_inits = sorted(classified["init_time"].unique())[-sample_cycles:]
    sub = classified[classified["init_time"].isin(recent_inits)].copy()

    batch_rows = []
    verified_count = 0
    for _, row in sub.iterrows():
        fid = f"FC-{pd.Timestamp(row['init_time']).strftime('%Y%m%d%H%M')}-{row['district'][:3].upper()}-L{int(row['lead_h'])}"
        src_preds = {
            m: {
                v: (round(float(row[f"{v}__{m}"]), 3) if pd.notna(row.get(f"{v}__{m}")) else None)
                for v in config.VARIABLES
            }
            for m in config.MODEL_KEYS
        }
        weights = {
            "W_NWP": round(float(row.get("eff_w_nwp", 0.0)), 4),
            "W_AI": round(float(row.get("eff_w_ai", 0.0)), 4),
            "W_Ensemble": round(float(row.get("eff_w_ensemble", 0.0)), 4),
        }
        blended_pred = {
            v: (round(float(row[f"{v}__blend"]), 3) if pd.notna(row.get(f"{v}__blend")) else None)
            for v in config.VARIABLES
        }

        has_obs = pd.notna(row.get("precip_6h_mm__obs"))
        ref_obs = None
        src_errs = None
        blend_err = None
        v_status = "PENDING_OBSERVATION"

        if has_obs:
            ref_obs = {
                v: (round(float(row[f"{v}__obs"]), 3) if pd.notna(row.get(f"{v}__obs")) else None)
                for v in config.VARIABLES
            }
            src_errs = {
                m: {
                    v: (
                        round(abs(float(row[f"{v}__{m}"]) - float(row[f"{v}__obs"])), 3)
                        if pd.notna(row.get(f"{v}__{m}")) and pd.notna(row.get(f"{v}__obs"))
                        else None
                    )
                    for v in config.VARIABLES
                }
                for m in config.MODEL_KEYS
            }
            blend_err = {
                v: (
                    round(abs(float(row[f"{v}__blend"]) - float(row[f"{v}__obs"])), 3)
                    if pd.notna(row.get(f"{v}__blend")) and pd.notna(row.get(f"{v}__obs"))
                    else None
                )
                for v in config.VARIABLES
            }
            v_status = "VERIFIED"
            verified_count += 1

        batch_rows.append({
            "forecast_id": fid,
            "district": str(row["district"]),
            "init_time": str(row["init_time"]),
            "valid_time": str(row["valid_time"]),
            "lead_h": int(row["lead_h"]),
            "source_predictions": src_preds,
            "adaptive_weights": weights,
            "final_blended_forecast": blended_pred,
            "event_category": str(row.get("hazard_type", "Normal Weather")),
            "model_version": str(row.get("model_version", "xgb-ext-20261120132204")),
            "reference_observation": ref_obs,
            "source_errors": src_errs,
            "blended_error": blend_err,
            "verification_status": v_status,
            "is_synthetic_observation": True,
        })

    stored_count = storage.store_forecast_feedback_batch(batch_rows)
    return {
        "stored_forecasts": stored_count,
        "verified_against_observations": verified_count,
        "is_synthetic_feedback": True,
        "feedback_note": "SIMULATED FEEDBACK: Observations matched from synthetic 2025 benchmark dataset (kerala_actual_observations_2021_2025.csv).",
    }


def continuous_learning_step(min_new_cycles: int = 28, drift_ratio_threshold: float = 1.20,
                             force_retrain: bool = False) -> dict:
    """Verify newly matured forecasts against observations, update feedback ledger, monitor 7d vs 90d error drift,
    and trigger candidate retraining + validation gate only when explicitly requested or when drift exceeds threshold.
    """
    ledger_sync = sync_forecast_feedback_ledger(sample_cycles=6)
    active = storage.get_kv("active_model")
    prev_eval = storage.get_kv("evaluation", {})
    prev_mae = prev_eval.get("overall_2025_test", {}).get("forexa_selected", {}).get("composite_norm_mae")

    lf = storage.read_table("training_features")
    drift_detected = False
    drift_ratio = 1.0
    if lf is not None and len(lf) > 0:
        recent_slice = lf.sort_values("init_time").tail(240)
        e7 = float(recent_slice["recent_err_7d"].mean())
        e90 = float(recent_slice["recent_err_90d"].mean()) or 1e-4
        drift_ratio = round(e7 / e90, 4)
        drift_detected = drift_ratio >= drift_ratio_threshold

    if not force_retrain and not drift_detected and active is not None:
        return {
            "triggered": False,
            "active_version": active["version"],
            "drift_ratio_7d_vs_90d": drift_ratio,
            "drift_threshold": drift_ratio_threshold,
            "drift_detected": False,
            "feedback_ledger_sync": ledger_sync,
            "reason": (
                f"Continuous online verification completed ({ledger_sync['verified_against_observations']} forecasts matched with "
                f"reference observations; 7d/90d drift ratio={drift_ratio:.3f} < {drift_ratio_threshold}). "
                "Existing deployed model passes validation; no retraining required."
            ),
        }

    result = engine.run_training("continuous_learning_candidate")
    cand_version = result["model"]["version"]
    cand_mae = result["test_composite_norm_mae"]["forexa_selected"]

    promoted = prev_mae is None or cand_mae <= prev_mae + 1e-4
    if not promoted and active is not None:
        storage.put_kv("active_model", active)
    return {
        "triggered": True,
        "trigger_reason": "drift_detected" if drift_detected else "force_retrain",
        "drift_ratio_7d_vs_90d": drift_ratio,
        "candidate_version": cand_version,
        "previous_version": active["version"] if active else None,
        "candidate_composite_norm_mae": cand_mae,
        "previous_composite_norm_mae": prev_mae,
        "promoted": promoted,
        "feedback_ledger_sync": ledger_sync,
    }


def rollback_active_model(target_version: str) -> dict:
    """Rollback deployed model to a previously validated version in the model registry."""
    registry = storage.get_kv("model_registry", [])
    match = next((m for m in registry if m.get("version") == target_version), None)
    if match is None:
        art = config.ARTIFACT_DIR / f"{target_version}.json"
        if not art.exists():
            raise ValueError(f"Model version {target_version} not found in registry or artifacts directory.")
        match = {
            "version": target_version,
            "artifact_path": str(art),
            "features": engine.FEATURES,
            "note": "restored_via_rollback",
        }
    storage.put_kv("active_model", match)
    engine._LOADED_XGB_MODEL = None
    engine._LOADED_MODEL_VERSION = None
    return {"rolled_back_to": target_version, "active_model": match}
