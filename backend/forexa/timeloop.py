"""FOREXA Dual Simulation Engine:
A. Live Stream Simulator (Minute-by-minute coherent NWP, AI, Ensemble forecast stream + live adaptive XGBoost blending).
B. FOREXA TimeLoop — Day-by-Day Forecast Learning Simulator (14-step causal forecast -> independent observation ->
   verification -> gated candidate XGBoost retraining & validation pipeline).

Safeguards Enforced:
* Never modifies or overwrites the production trained model artifact (`xgb-ext-20261120132204.json`).
* Independent synthetic observations are generated from a latent physical monsoon process (seasonal wave + orographic uplift +
  barometric perturbation) and are NEVER calculated from forecast predictions or their weighted average.
* Candidate XGBoost retraining uses the exact 31-feature schema (`engine.FEATURES`) and monotonic constraints (`engine.MONOTONE_CONSTRAINTS`),
  and promotes a candidate ONLY if validation MAE strictly improves on held-out chronological validation data.
"""
from __future__ import annotations

import copy
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd
import xgboost as xgb

from . import config, engine, ingestion, metrics, risk, storage

MONITORED_DISTRICTS = config.NATIVE_DISTRICTS  # 8 monitored Kerala districts


# ==============================================================================
# A. LIVE STREAM SIMULATOR (MINUTE-BY-MINUTE SYNTHETIC STREAM)
# ==============================================================================
_LIVE_STREAM_STATE: dict[str, Any] = {}


def reset_live_stream() -> dict[str, Any]:
    """Initialize or reset the minute-by-minute Live Stream Simulator state."""
    global _LIVE_STREAM_STATE
    _, active_meta = engine.load_trained_xgb_model()
    base_version = active_meta.get("version", "xgb-ext-20261120132204")

    _LIVE_STREAM_STATE = {
        "simulation_label": "SIMULATED LIVE DATA",
        "tick_minute": 0,
        "simulated_timestamp_utc": "2025-07-15T06:00:00Z",
        "model_version": base_version,
        "event_phase": "Developing Monsoon Trough",
        "source_status": {"nwp": "ONLINE", "ai": "ONLINE", "ensemble": "ONLINE"},
        "unified_weights": {"W_NWP_pct": 2.4, "W_AI_pct": 33.5, "W_Ensemble_pct": 64.1},
        "districts": [],
        "stream_log": [],
    }
    return step_live_stream(advance_minutes=0)


def step_live_stream(
    advance_minutes: int = 1,
    selected_district: str = "Wayanad",
    force_fail_source: str | None = None,
) -> dict[str, Any]:
    """Advance the Live Stream Simulator by `advance_minutes` and run the trained XGBoost weighting model."""
    global _LIVE_STREAM_STATE
    if not _LIVE_STREAM_STATE:
        reset_live_stream()

    model, active_meta = engine.load_trained_xgb_model()
    scale = active_meta.get("scale") or {
        "temp_c": 2.45,
        "precip_6h_mm": 18.2,
        "humidity_pct": 8.5,
        "wind_ms": 2.1,
        "pressure_hpa": 3.2,
    }

    tick = int(_LIVE_STREAM_STATE["tick_minute"]) + int(advance_minutes)
    _LIVE_STREAM_STATE["tick_minute"] = tick
    base_ts = datetime(2025, 7, 15, 6, 0, 0, tzinfo=timezone.utc) + timedelta(minutes=tick)
    _LIVE_STREAM_STATE["simulated_timestamp_utc"] = base_ts.strftime("%Y-%m-%d %H:%M:%S UTC")

    rng = np.random.default_rng(1000 + tick)

    # Coherent synoptic wave across minutes: builds up to a squall peak around minute 6-10, then moderates
    phase_angle = (tick % 18) / 18.0 * np.pi
    synoptic_intensity = float(np.sin(phase_angle))  # 0.0 -> 1.0 -> 0.0

    if synoptic_intensity >= 0.80:
        event_phase = "Peak Orographic Cloudburst & Squall Line"
    elif synoptic_intensity >= 0.45:
        event_phase = "Intensifying Southwest Monsoon Surge"
    else:
        event_phase = "Steady Monsoon Flow"

    # Simulate transient source failure & automatic recovery (or explicit failure test)
    avail_map = {"nwp": 1.0, "ai": 1.0, "ensemble": 1.0}
    if force_fail_source in avail_map:
        avail_map[force_fail_source] = 0.0
    elif tick in (5, 6):
        # Transient NWP telemetry dropout at minute 5-6, auto-recovering at minute 7
        avail_map["nwp"] = 0.0

    n_active = sum(avail_map.values())
    source_status = {k: ("ONLINE" if v > 0 else "OFFLINE (Auto-Failover)") for k, v in avail_map.items()}

    district_records = []
    feature_rows = []

    for d in MONITORED_DISTRICTS:
        meta = config.DISTRICT_METADATA[d]
        elev_factor = 1.35 if meta["elev_m"] >= 500 else (1.15 if "Coastal" in meta["zone"] else 1.0)

        # True underlying atmospheric signal for this minute
        base_rain = max(0.0, (14.0 + 38.0 * synoptic_intensity) * elev_factor)
        base_temp = 26.5 - (meta["elev_m"] / 350.0) - 1.8 * synoptic_intensity
        base_hum = min(99.0, 82.0 + 15.0 * synoptic_intensity)
        base_wind = (6.5 + 8.5 * synoptic_intensity) * (1.2 if "Coastal" in meta["zone"] else 1.0)
        base_press = 1008.5 - 6.5 * synoptic_intensity

        # Generate coherent NWP, AI, and Ensemble forecast updates
        # NWP has higher phase lag & smoothing error during rapid convective spikes
        nwp_rain = max(0.0, round(base_rain * 0.76 + float(rng.normal(0, 3.2)), 2))
        ai_rain = max(0.0, round(base_rain * 0.94 + float(rng.normal(0, 1.4)), 2))
        ens_rain = max(0.0, round(base_rain * 0.98 + float(rng.normal(0, 0.9)), 2))

        nwp_temp = round(base_temp + float(rng.normal(0.4, 0.35)), 2)
        ai_temp = round(base_temp + float(rng.normal(0.1, 0.2)), 2)
        ens_temp = round(base_temp + float(rng.normal(0.05, 0.15)), 2)

        nwp_wind = max(0.5, round(base_wind * 0.85 + float(rng.normal(0, 0.5)), 2))
        ai_wind = max(0.5, round(base_wind * 0.96 + float(rng.normal(0, 0.25)), 2))
        ens_wind = max(0.5, round(base_wind * 0.99 + float(rng.normal(0, 0.2)), 2))

        nwp_press = round(base_press + float(rng.normal(0.8, 0.4)), 1)
        ai_press = round(base_press + float(rng.normal(0.0, 0.15)), 1)
        ens_press = round(base_press + float(rng.normal(0.1, 0.2)), 1)

        nwp_hum = min(100.0, max(50.0, round(base_hum + float(rng.normal(-2.0, 1.5)), 1)))
        ai_hum = min(100.0, max(50.0, round(base_hum + float(rng.normal(-0.5, 0.8)), 1)))
        ens_hum = min(100.0, max(50.0, round(base_hum + float(rng.normal(0.0, 0.6)), 1)))

        mm_precip = float(np.mean([nwp_rain, ai_rain, ens_rain]))
        max_precip = float(np.max([nwp_rain, ai_rain, ens_rain]))
        mm_temp = float(np.mean([nwp_temp, ai_temp, ens_temp]))
        mm_wind = float(np.mean([nwp_wind, ai_wind, ens_wind]))
        max_wind = float(np.max([nwp_wind, ai_wind, ens_wind]))
        min_press = float(np.min([nwp_press, ai_press, ens_press]))
        disagreement = float(np.std([nwp_rain, ai_rain, ens_rain]) / scale["precip_6h_mm"])
        ext_prob = float(np.clip((max_precip - 20.0) / 35.0, 0.0, 1.0))
        live_event_code = 4 if max_precip >= 45.0 else (3 if max_wind >= 12.5 else (1 if max_precip >= 20.0 else 0))

        # Build exact 31-feature vector for each of the 3 models
        hist_errs = {"nwp": 0.42, "ensemble": 0.12, "ai": 0.16}
        preds_by_m = {
            "nwp": {"precip_6h_mm": nwp_rain, "temp_c": nwp_temp, "humidity_pct": nwp_hum, "wind_ms": nwp_wind, "pressure_hpa": nwp_press},
            "ensemble": {"precip_6h_mm": ens_rain, "temp_c": ens_temp, "humidity_pct": ens_hum, "wind_ms": ens_wind, "pressure_hpa": ens_press},
            "ai": {"precip_6h_mm": ai_rain, "temp_c": ai_temp, "humidity_pct": ai_hum, "wind_ms": ai_wind, "pressure_hpa": ai_press},
        }
        for m_idx, m_key in enumerate(engine.M):
            dev = abs(preds_by_m[m_key]["precip_6h_mm"] - mm_precip) / scale["precip_6h_mm"]
            feature_rows.append({
                "district": d,
                "model": m_key,
                "lead_h": 24,
                "district_code": engine.DISTRICT_CODE.get(d, 0),
                "elevation_m": meta["elev_m"],
                "latitude": meta["lat"],
                "longitude": meta["lon"],
                "month_sin": float(np.sin(2 * np.pi * 7 / 12)),
                "month_cos": float(np.cos(2 * np.pi * 7 / 12)),
                "season_code": 2,
                "regime_code": 3 if mm_precip >= 25.0 else 2,
                "live_event_code": live_event_code,
                "extreme_prob": ext_prob,
                "mm_precip": mm_precip,
                "max_precip": max_precip,
                "mm_temp": mm_temp,
                "mm_wind": mm_wind,
                "max_wind": max_wind,
                "min_pressure": min_press,
                "disagreement": disagreement,
                "ens_temp_spread": 0.55,
                "ens_precip_spread": round(0.12 * ens_rain + 0.8, 2),
                "ens_precip_prob": min(99.0, round(40.0 + 55.0 * synoptic_intensity, 1)),
                "deviation": dev,
                "recent_err_7d": hist_errs[m_key],
                "recent_err_30d": hist_errs[m_key],
                "recent_err_90d": hist_errs[m_key],
                "hist_dist_lead_err": hist_errs[m_key],
                "event_specific_hist_err": hist_errs[m_key] * (0.85 if m_key == "ensemble" else 1.05),
                "event_best_model_flag": 1.0 if m_key == "ensemble" else 0.0,
                "availability": avail_map[m_key],
                "n_active_sources": n_active,
                "model_code": m_idx,
            })

        district_records.append({
            "district": d,
            "sources": preds_by_m,
            "ext_prob": ext_prob,
        })

    # Run actual trained XGBoost model inference on the live feature matrix
    feat_df = pd.DataFrame(feature_rows)
    feat_df["pred_err"] = model.predict(feat_df[engine.FEATURES])

    # Aggregate predicted errors across configuration to produce ONE unified weight set
    mean_pred_err = feat_df.groupby("model")["pred_err"].mean().to_dict()
    pe_arr = np.array([[mean_pred_err["nwp"], mean_pred_err["ensemble"], mean_pred_err["ai"]]])
    act_arr = np.array([[avail_map["nwp"] > 0, avail_map["ensemble"] > 0, avail_map["ai"] > 0]])

    w_arr = engine.inverse_error_weights(pe_arr, act_arr, power=3.0)[0]
    w_nwp, w_ens, w_ai = float(w_arr[0]), float(w_arr[1]), float(w_arr[2])

    unified_weights = {
        "W_NWP": round(w_nwp, 4),
        "W_AI": round(w_ai, 4),
        "W_Ensemble": round(w_ens, 4),
        "W_NWP_pct": round(w_nwp * 100.0, 1),
        "W_AI_pct": round(w_ai * 100.0, 1),
        "W_Ensemble_pct": round(w_ens * 100.0, 1),
        "pred_err_nwp": round(float(mean_pred_err["nwp"]), 4),
        "pred_err_ai": round(float(mean_pred_err["ai"]), 4),
        "pred_err_ensemble": round(float(mean_pred_err["ensemble"]), 4),
    }

    # Compute final blended forecast for each district using the unified weights
    out_districts = []
    for rec in district_records:
        d = rec["district"]
        src = rec["sources"]
        blended = {}
        for v in config.VARIABLES:
            val = (
                src["nwp"][v] * w_nwp
                + src["ai"][v] * w_ai
                + src["ensemble"][v] * w_ens
            )
            blended[v] = round(float(val), 2)

        rain = blended["precip_6h_mm"]
        wind = blended["wind_ms"]
        ev_type = (
            "Extremely Heavy Rainfall"
            if rain >= 50.0
            else "Very Heavy Rainfall"
            if rain >= 35.0
            else "Heavy Rainfall"
            if rain >= 20.0
            else "Moderate Rainfall"
        )
        out_districts.append({
            "district": d,
            "event_type": ev_type,
            "sources": src,
            "blended": blended,
            "unified_weights": unified_weights,
        })

    out_districts.sort(key=lambda x: x["blended"]["precip_6h_mm"], reverse=True)
    focus = next((x for x in out_districts if x["district"] == selected_district), out_districts[0])

    log_entry = {
        "tick_minute": tick,
        "timestamp": _LIVE_STREAM_STATE["simulated_timestamp_utc"],
        "event_phase": event_phase,
        "source_status": source_status,
        "unified_weights": unified_weights,
        "focus_district": focus["district"],
        "focus_blended_rain_mm": focus["blended"]["precip_6h_mm"],
        "focus_blended_temp_c": focus["blended"]["temp_c"],
        "focus_blended_wind_ms": focus["blended"]["wind_ms"],
    }
    _LIVE_STREAM_STATE["event_phase"] = event_phase
    _LIVE_STREAM_STATE["source_status"] = source_status
    _LIVE_STREAM_STATE["unified_weights"] = unified_weights
    _LIVE_STREAM_STATE["districts"] = out_districts
    _LIVE_STREAM_STATE["focus_district_telemetry"] = focus
    _LIVE_STREAM_STATE["stream_log"] = ([log_entry] + _LIVE_STREAM_STATE.get("stream_log", []))[:20]

    return _LIVE_STREAM_STATE


# ==============================================================================
# B. FOREXA TIMELOOP — DAY-BY-DAY FORECAST LEARNING SIMULATOR
# ==============================================================================
_TIMELOOP_STATE: dict[str, Any] = {}


def _generate_independent_day_weather(day_index: int, sim_date: datetime) -> dict[str, dict[str, float]]:
    """Generate independent latent physical weather state AND independent synthetic observations
    for all 8 monitored Kerala districts on `sim_date`.

    CRITICAL SAFEGUARD:
    * The synthetic observation is generated FIRST from an independent physical monsoon model
      (seasonal progression + terrain elevation + random synoptic barometric wave).
    * Source forecasts (NWP, AI, Ensemble) are generated separately with their own physical/structural error
      characteristics, so observations are NEVER derived from forecast predictions or their weighted average.
    """
    rng = np.random.default_rng(5000 + day_index * 37)
    # Multi-day monsoon wave (creates realistic dry spells, moderate days, and 3-day extreme monsoon surges)
    synoptic_wave = float(np.sin(day_index * 0.65) ** 2)
    is_surge_day = (day_index % 4 == 2) or synoptic_wave > 0.72

    day_truth: dict[str, dict[str, float]] = {}
    for d in MONITORED_DISTRICTS:
        meta = config.DISTRICT_METADATA[d]
        orographic_mult = 1.42 if meta["elev_m"] >= 500 else (1.18 if "Coastal" in meta["zone"] else 1.0)

        base_rain = (12.0 + (36.0 if is_surge_day else 14.0) * synoptic_wave) * orographic_mult
        obs_rain = max(0.0, round(base_rain + float(rng.normal(0.0, 2.2)), 2))
        obs_temp = round(27.2 - (meta["elev_m"] / 340.0) - 1.6 * synoptic_wave + float(rng.normal(0.0, 0.25)), 2)
        obs_hum = min(99.0, max(62.0, round(81.0 + 14.0 * synoptic_wave + float(rng.normal(0.0, 1.1)), 1)))
        obs_wind = max(1.0, round((5.5 + 7.5 * synoptic_wave) + float(rng.normal(0.0, 0.45)), 2))
        obs_press = round(1009.0 - 6.0 * synoptic_wave + float(rng.normal(0.0, 0.3)), 1)

        day_truth[d] = {
            "precip_6h_mm": obs_rain,
            "temp_c": obs_temp,
            "humidity_pct": obs_hum,
            "wind_ms": obs_wind,
            "pressure_hpa": obs_press,
        }
    return day_truth


def _generate_day_forecasts_and_blend(
    day_index: int,
    sim_date_str: str,
    model: xgb.XGBRegressor,
    model_version: str,
    scale: dict[str, float],
    rolling_source_errors: dict[str, float],
) -> dict[str, Any]:
    """Steps 2, 3 & 4 of TimeLoop:
    Generate NWP, AI, and Ensemble forecasts for `sim_date_str`, run the active adaptive XGBoost model
    using its exact 31-feature schema, and compute the unified blended forecast.
    """
    rng = np.random.default_rng(9000 + day_index * 53)
    synoptic_wave = float(np.sin(day_index * 0.65) ** 2)
    is_surge_day = (day_index % 4 == 2) or synoptic_wave > 0.72

    raw_forecasts_by_dist: dict[str, dict[str, dict[str, float]]] = {}
    feature_rows = []

    for d in MONITORED_DISTRICTS:
        meta = config.DISTRICT_METADATA[d]
        orographic_mult = 1.42 if meta["elev_m"] >= 500 else (1.18 if "Coastal" in meta["zone"] else 1.0)
        expected_signal_rain = (12.0 + (36.0 if is_surge_day else 14.0) * synoptic_wave) * orographic_mult
        expected_temp = 27.2 - (meta["elev_m"] / 340.0) - 1.6 * synoptic_wave
        expected_hum = min(99.0, 81.0 + 14.0 * synoptic_wave)
        expected_wind = 5.5 + 7.5 * synoptic_wave
        expected_press = 1009.0 - 6.0 * synoptic_wave

        # Independent forecast generator for each source (never sees the observation random draw!)
        nwp_fc = {
            "precip_6h_mm": max(0.0, round(expected_signal_rain * 0.72 + float(rng.normal(1.5, 4.8)), 2)),
            "temp_c": round(expected_temp + float(rng.normal(0.55, 0.5)), 2),
            "humidity_pct": min(100.0, max(50.0, round(expected_hum + float(rng.normal(-2.5, 2.2)), 1))),
            "wind_ms": max(0.5, round(expected_wind * 0.82 + float(rng.normal(0.2, 0.7)), 2)),
            "pressure_hpa": round(expected_press + float(rng.normal(0.9, 0.6)), 1),
        }
        ai_fc = {
            "precip_6h_mm": max(0.0, round(expected_signal_rain * 0.93 + float(rng.normal(-0.4, 2.0)), 2)),
            "temp_c": round(expected_temp + float(rng.normal(0.15, 0.25)), 2),
            "humidity_pct": min(100.0, max(50.0, round(expected_hum + float(rng.normal(-0.6, 1.0)), 1))),
            "wind_ms": max(0.5, round(expected_wind * 0.95 + float(rng.normal(-0.1, 0.35)), 2)),
            "pressure_hpa": round(expected_press + float(rng.normal(0.05, 0.22)), 1),
        }
        ens_fc = {
            "precip_6h_mm": max(0.0, round(expected_signal_rain * 0.98 + float(rng.normal(0.1, 1.35)), 2)),
            "temp_c": round(expected_temp + float(rng.normal(0.08, 0.2)), 2),
            "humidity_pct": min(100.0, max(50.0, round(expected_hum + float(rng.normal(0.1, 0.8)), 1))),
            "wind_ms": max(0.5, round(expected_wind * 0.99 + float(rng.normal(0.0, 0.25)), 2)),
            "pressure_hpa": round(expected_press + float(rng.normal(0.02, 0.25)), 1),
        }

        raw_forecasts_by_dist[d] = {"nwp": nwp_fc, "ai": ai_fc, "ensemble": ens_fc}

        mm_precip = float(np.mean([nwp_fc["precip_6h_mm"], ai_fc["precip_6h_mm"], ens_fc["precip_6h_mm"]]))
        max_precip = float(np.max([nwp_fc["precip_6h_mm"], ai_fc["precip_6h_mm"], ens_fc["precip_6h_mm"]]))
        mm_temp = float(np.mean([nwp_fc["temp_c"], ai_fc["temp_c"], ens_fc["temp_c"]]))
        mm_wind = float(np.mean([nwp_fc["wind_ms"], ai_fc["wind_ms"], ens_fc["wind_ms"]]))
        max_wind = float(np.max([nwp_fc["wind_ms"], ai_fc["wind_ms"], ens_fc["wind_ms"]]))
        min_press = float(np.min([nwp_fc["pressure_hpa"], ai_fc["pressure_hpa"], ens_fc["pressure_hpa"]]))
        disagreement = float(
            np.std([nwp_fc["precip_6h_mm"], ai_fc["precip_6h_mm"], ens_fc["precip_6h_mm"]]) / scale["precip_6h_mm"]
        )
        ext_prob = float(np.clip((max_precip - 20.0) / 35.0, 0.0, 1.0))
        live_event_code = 4 if max_precip >= 45.0 else (1 if max_precip >= 20.0 else 0)

        for m_idx, m_key in enumerate(engine.M):
            fc_m = raw_forecasts_by_dist[d][m_key]
            dev = abs(fc_m["precip_6h_mm"] - mm_precip) / scale["precip_6h_mm"]
            r_err = float(rolling_source_errors.get(m_key, 0.25))
            feature_rows.append({
                "district": d,
                "model": m_key,
                "lead_h": 24,
                "district_code": engine.DISTRICT_CODE.get(d, 0),
                "elevation_m": meta["elev_m"],
                "latitude": meta["lat"],
                "longitude": meta["lon"],
                "month_sin": float(np.sin(2 * np.pi * 6 / 12)),
                "month_cos": float(np.cos(2 * np.pi * 6 / 12)),
                "season_code": 2,
                "regime_code": 3 if mm_precip >= 25.0 else 2,
                "live_event_code": live_event_code,
                "extreme_prob": ext_prob,
                "mm_precip": mm_precip,
                "max_precip": max_precip,
                "mm_temp": mm_temp,
                "mm_wind": mm_wind,
                "max_wind": max_wind,
                "min_pressure": min_press,
                "disagreement": disagreement,
                "ens_temp_spread": 0.5,
                "ens_precip_spread": round(0.14 * ens_fc["precip_6h_mm"] + 0.7, 2),
                "ens_precip_prob": min(99.0, round(35.0 + 55.0 * synoptic_wave, 1)),
                "deviation": dev,
                "recent_err_7d": r_err,
                "recent_err_30d": r_err,
                "recent_err_90d": r_err,
                "hist_dist_lead_err": r_err,
                "event_specific_hist_err": r_err * (0.85 if m_key == "ensemble" else 1.05),
                "event_best_model_flag": 1.0 if m_key == "ensemble" else 0.0,
                "availability": 1.0,
                "n_active_sources": 3.0,
                "model_code": m_idx,
            })

    feat_df = pd.DataFrame(feature_rows)
    feat_df["pred_err"] = model.predict(feat_df[engine.FEATURES])

    mean_pred_err = feat_df.groupby("model")["pred_err"].mean().to_dict()
    pe_arr = np.array([[mean_pred_err["nwp"], mean_pred_err["ensemble"], mean_pred_err["ai"]]])
    act_arr = np.array([[True, True, True]])
    w_arr = engine.inverse_error_weights(pe_arr, act_arr, power=3.0)[0]
    w_nwp, w_ens, w_ai = float(w_arr[0]), float(w_arr[1]), float(w_arr[2])

    weights = {
        "W_NWP": round(w_nwp, 4),
        "W_AI": round(w_ai, 4),
        "W_Ensemble": round(w_ens, 4),
        "W_NWP_pct": round(w_nwp * 100.0, 1),
        "W_AI_pct": round(w_ai * 100.0, 1),
        "W_Ensemble_pct": round(w_ens * 100.0, 1),
        "pred_err_nwp": round(float(mean_pred_err["nwp"]), 4),
        "pred_err_ai": round(float(mean_pred_err["ai"]), 4),
        "pred_err_ensemble": round(float(mean_pred_err["ensemble"]), 4),
    }

    blended_by_dist: dict[str, dict[str, float]] = {}
    for d, srcs in raw_forecasts_by_dist.items():
        blended_by_dist[d] = {
            v: round(
                srcs["nwp"][v] * w_nwp + srcs["ai"][v] * w_ai + srcs["ensemble"][v] * w_ens,
                2,
            )
            for v in config.VARIABLES
        }

    return {
        "valid_date": sim_date_str,
        "model_version": model_version,
        "weights": weights,
        "forecasts_by_district": raw_forecasts_by_dist,
        "blended_by_district": blended_by_dist,
        "feature_df": feat_df,
    }


def reset_timeloop(start_date: str = "2025-06-01") -> dict[str, Any]:
    """Reset FOREXA TimeLoop to Day 0 using the original production trained XGBoost model."""
    global _TIMELOOP_STATE
    prod_model, active_meta = engine.load_trained_xgb_model()
    base_version = active_meta.get("version", "xgb-ext-20261120132204")
    scale = active_meta.get("scale") or {
        "temp_c": 2.45,
        "precip_6h_mm": 18.2,
        "humidity_pct": 8.5,
        "wind_ms": 2.1,
        "pressure_hpa": 3.2,
    }

    try:
        dt0 = datetime.strptime(start_date[:10], "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except Exception:
        dt0 = datetime(2025, 6, 1, tzinfo=timezone.utc)

    rolling_errs = {"nwp": 0.44, "ai": 0.165, "ensemble": 0.125}

    # Generate Day 1 forecast package at Day 0 initialization
    next_date = dt0 + timedelta(days=1)
    pending_forecast = _generate_day_forecasts_and_blend(
        day_index=1,
        sim_date_str=next_date.strftime("%Y-%m-%d"),
        model=prod_model,
        model_version=base_version,
        scale=scale,
        rolling_source_errors=rolling_errs,
    )

    _TIMELOOP_STATE = {
        "simulation_badge": "FOREXA TIMELOOP — SIMULATED LEARNING DEMONSTRATION",
        "observation_badge": "SYNTHETIC OBSERVATIONS",
        "start_date": dt0.strftime("%Y-%m-%d"),
        "current_simulated_date": dt0.strftime("%Y-%m-%d"),
        "completed_cycles": 0,
        "min_cycles_for_retraining": 3,
        "original_production_model_version": base_version,
        "current_model_version": base_version,
        "previous_model_version": base_version,
        "candidate_status": "AWAITING_MIN_DATA (0/3 days)",
        "active_model_obj": prod_model,
        "scale": scale,
        "rolling_source_errors": rolling_errs,
        "pending_forecast": pending_forecast,
        "accumulated_training_rows": [],
        "yesterday_comparison": None,
        "daily_trend": [],
        "version_history": [
            {
                "version": base_version,
                "day": 0,
                "date": dt0.strftime("%Y-%m-%d"),
                "status": "INCUMBENT_DEPLOYED",
                "val_composite_mae": 0.1076,
                "rain_mae_mm": 1.502,
                "note": "Original production trained XGBoost adaptive weighting model.",
            }
        ],
        "activity_log": [
            {
                "day": 0,
                "date": dt0.strftime("%Y-%m-%d"),
                "event": f"TimeLoop initialized at {dt0.strftime('%Y-%m-%d')} with production model {base_version}. Generated Day 1 forecast for {next_date.strftime('%Y-%m-%d')}.",
            }
        ],
        "before_after_metrics": None,
        "performance_summary": (
            f"TimeLoop initialized on {dt0.strftime('%Y-%m-%d')} using production model {base_version}. "
            "Advance the simulated day to generate independent synthetic observations, verify yesterday's forecast, "
            "and accumulate training pairs for candidate retraining."
        ),
    }
    return get_timeloop_public_state()


def step_timeloop_day(days: int = 1) -> dict[str, Any]:
    """Execute the 14-step FOREXA TimeLoop cycle for `days` simulated days."""
    global _TIMELOOP_STATE
    if not _TIMELOOP_STATE:
        reset_timeloop()

    for _ in range(max(1, min(days, 15))):
        _execute_single_day_cycle()

    return get_timeloop_public_state()


def _execute_single_day_cycle() -> None:
    global _TIMELOOP_STATE
    st = _TIMELOOP_STATE
    day_idx = int(st["completed_cycles"]) + 1
    pending = st["pending_forecast"]
    valid_date_str = pending["valid_date"]
    valid_dt = datetime.strptime(valid_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    scale = st["scale"]

    # Step 5 & 6: Advance clock to `valid_date_str` and generate INDEPENDENT synthetic observations
    obs_by_dist = _generate_independent_day_weather(day_idx, valid_dt)

    # Step 7 & 8: Match yesterday's forecast with today's observation by district, variable & valid_time
    # and compute source-wise and blended errors (MAE, RMSE, Bias)
    dist_comparisons = []
    err_arrays: dict[str, list[float]] = {"nwp": [], "ai": [], "ensemble": [], "blended": []}
    comp_norm_errs: dict[str, list[float]] = {"nwp": [], "ai": [], "ensemble": [], "blended": []}

    feat_df: pd.DataFrame = pending["feature_df"].copy()
    targets = []

    for d in MONITORED_DISTRICTS:
        obs_d = obs_by_dist[d]
        fc_d = pending["forecasts_by_district"][d]
        bl_d = pending["blended_by_district"][d]

        rain_obs = obs_d["precip_6h_mm"]
        err_arrays["nwp"].append(fc_d["nwp"]["precip_6h_mm"] - rain_obs)
        err_arrays["ai"].append(fc_d["ai"]["precip_6h_mm"] - rain_obs)
        err_arrays["ensemble"].append(fc_d["ensemble"]["precip_6h_mm"] - rain_obs)
        err_arrays["blended"].append(bl_d["precip_6h_mm"] - rain_obs)

        for m_key in ("nwp", "ai", "ensemble"):
            c_err = float(
                np.mean([abs(fc_d[m_key][v] - obs_d[v]) / scale[v] for v in config.VARIABLES])
            )
            comp_norm_errs[m_key].append(c_err)

        b_comp_err = float(
            np.mean([abs(bl_d[v] - obs_d[v]) / scale[v] for v in config.VARIABLES])
        )
        comp_norm_errs["blended"].append(b_comp_err)

        dist_comparisons.append({
            "district": d,
            "valid_date": valid_date_str,
            "observation_label": "SYNTHETIC OBSERVATION",
            "observed_rain_mm": rain_obs,
            "nwp_rain_mm": fc_d["nwp"]["precip_6h_mm"],
            "ai_rain_mm": fc_d["ai"]["precip_6h_mm"],
            "ensemble_rain_mm": fc_d["ensemble"]["precip_6h_mm"],
            "blended_rain_mm": bl_d["precip_6h_mm"],
            "nwp_abs_err_mm": round(abs(fc_d["nwp"]["precip_6h_mm"] - rain_obs), 2),
            "ai_abs_err_mm": round(abs(fc_d["ai"]["precip_6h_mm"] - rain_obs), 2),
            "ensemble_abs_err_mm": round(abs(fc_d["ensemble"]["precip_6h_mm"] - rain_obs), 2),
            "blended_abs_err_mm": round(abs(bl_d["precip_6h_mm"] - rain_obs), 2),
            "observed_temp_c": obs_d["temp_c"],
            "blended_temp_c": bl_d["temp_c"],
            "observed_wind_ms": obs_d["wind_ms"],
            "blended_wind_ms": bl_d["wind_ms"],
        })

    # Attach verified target composite error to yesterday's feature rows for candidate training
    for _, f_row in feat_df.iterrows():
        d_name = str(f_row["district"])
        m_name = str(f_row["model"])
        obs_d = obs_by_dist[d_name]
        fc_m = pending["forecasts_by_district"][d_name][m_name]
        t_err = float(np.mean([abs(fc_m[v] - obs_d[v]) / scale[v] for v in config.VARIABLES]))
        targets.append(t_err)

    feat_df["target"] = targets
    feat_df["sim_day"] = day_idx
    st["accumulated_training_rows"].append(feat_df)

    def _summarize_err(diffs: list[float], norm_errs: list[float]) -> dict[str, float]:
        arr = np.array(diffs, dtype=float)
        return {
            "rain_mae_mm": round(float(np.mean(np.abs(arr))), 3),
            "rain_rmse_mm": round(float(np.sqrt(np.mean(arr ** 2))), 3),
            "rain_bias_mm": round(float(np.mean(arr)), 3),
            "composite_norm_mae": round(float(np.mean(norm_errs)), 4),
        }

    day_metrics = {
        "nwp": _summarize_err(err_arrays["nwp"], comp_norm_errs["nwp"]),
        "ai": _summarize_err(err_arrays["ai"], comp_norm_errs["ai"]),
        "ensemble": _summarize_err(err_arrays["ensemble"], comp_norm_errs["ensemble"]),
        "blended": _summarize_err(err_arrays["blended"], comp_norm_errs["blended"]),
    }

    # Update causal rolling source error memory using today's verified observation errors
    for m_key in ("nwp", "ai", "ensemble"):
        old_e = float(st["rolling_source_errors"][m_key])
        new_e = float(np.mean(comp_norm_errs[m_key]))
        st["rolling_source_errors"][m_key] = round(0.70 * old_e + 0.30 * new_e, 4)

    st["completed_cycles"] = day_idx
    st["current_simulated_date"] = valid_date_str
    st["yesterday_comparison"] = {
        "valid_date": valid_date_str,
        "model_version_used": pending["model_version"],
        "weights_applied": pending["weights"],
        "metrics": day_metrics,
        "districts": dist_comparisons,
    }

    # Step 10, 11 & 12: Candidate Retraining & Validation Gate when minimum data requirement is met
    min_req = int(st["min_cycles_for_retraining"])
    candidate_event_note = f"Verified Day {day_idx} ({valid_date_str}): Blended Rain MAE = {day_metrics['blended']['rain_mae_mm']} mm."

    if day_idx < min_req:
        st["candidate_status"] = f"ACCUMULATING_DATA ({day_idx}/{min_req} days)"
    elif day_idx % min_req == 0:
        # Train a candidate XGBRegressor on historical baseline + accumulated causal TimeLoop pairs
        st["candidate_status"] = "TRAINING -> VALIDATING"
        sim_all = pd.concat(st["accumulated_training_rows"], ignore_index=True)

        # Split accumulated simulated data chronologically: first 75% train, latest 25% chronological validation
        cutoff_day = max(1, int(day_idx * 0.75))
        sim_tr = sim_all[sim_all["sim_day"] <= cutoff_day]
        sim_va = sim_all[sim_all["sim_day"] > cutoff_day]
        if len(sim_va) == 0:
            sim_va = sim_all.tail(24)

        # Combine with a causal slice of pre-2024 training features so the candidate retains full domain knowledge
        base_lf = storage.read_table("training_features")
        if base_lf is not None:
            hist_tr = base_lf[base_lf["init_time"] < engine.TRAIN_END].dropna(subset=["target"]).tail(3600)
            train_X = pd.concat([hist_tr[engine.FEATURES], sim_tr[engine.FEATURES]], ignore_index=True)
            train_y = pd.concat([hist_tr["target"], sim_tr["target"]], ignore_index=True)
        else:
            train_X = sim_tr[engine.FEATURES]
            train_y = sim_tr["target"]

        val_X = sim_va[engine.FEATURES]
        val_y = sim_va["target"]

        incumbent_model: xgb.XGBRegressor = st["active_model_obj"]
        inc_val_preds = incumbent_model.predict(val_X)
        inc_val_mae = round(float(np.mean(np.abs(inc_val_preds - val_y))), 5)
        inc_val_rmse = round(float(np.sqrt(np.mean((inc_val_preds - val_y) ** 2))), 5)
        inc_val_bias = round(float(np.mean(inc_val_preds - val_y)), 5)

        cand_model = xgb.XGBRegressor(
            n_estimators=180,
            max_depth=4,
            learning_rate=0.04,
            subsample=0.85,
            colsample_bytree=0.85,
            min_child_weight=8,
            reg_lambda=1.5,
            monotone_constraints=engine.MONOTONE_CONSTRAINTS,
            random_state=42 + day_idx,
            n_jobs=2,
        )
        cand_model.fit(train_X, train_y, eval_set=[(val_X, val_y)], verbose=False)

        cand_val_preds = cand_model.predict(val_X)
        cand_val_mae = round(float(np.mean(np.abs(cand_val_preds - val_y))), 5)
        cand_val_rmse = round(float(np.sqrt(np.mean((cand_val_preds - val_y) ** 2))), 5)
        cand_val_bias = round(float(np.mean(cand_val_preds - val_y)), 5)

        cand_version = f"xgb-timeloop-d{day_idx:02d}"
        promoted = bool(cand_val_mae < inc_val_mae)

        st["before_after_metrics"] = {
            "evaluated_on_day": day_idx,
            "incumbent_version": st["current_model_version"],
            "candidate_version": cand_version,
            "before_training": {
                "mae": inc_val_mae,
                "rmse": inc_val_rmse,
                "bias": inc_val_bias,
            },
            "after_training": {
                "mae": cand_val_mae,
                "rmse": cand_val_rmse,
                "bias": cand_val_bias,
            },
            "promoted": promoted,
        }

        if promoted:
            st["previous_model_version"] = st["current_model_version"]
            st["current_model_version"] = cand_version
            st["active_model_obj"] = cand_model
            st["candidate_status"] = "PROMOTED"
            candidate_event_note += (
                f" Candidate {cand_version} PROMOTED (Validation MAE improved from {inc_val_mae} to {cand_val_mae})."
            )
        else:
            st["candidate_status"] = "REJECTED (Incumbent Retained)"
            candidate_event_note += (
                f" Candidate {cand_version} REJECTED (Candidate MAE {cand_val_mae} >= Incumbent MAE {inc_val_mae}); retained {st['current_model_version']}."
            )

        st["version_history"].insert(
            0,
            {
                "version": cand_version,
                "day": day_idx,
                "date": valid_date_str,
                "status": "PROMOTED" if promoted else "REJECTED",
                "val_composite_mae": cand_val_mae,
                "incumbent_val_mae": inc_val_mae,
                "rain_mae_mm": day_metrics["blended"]["rain_mae_mm"],
                "note": candidate_event_note,
            },
        )

    # Record daily performance trend
    st["daily_trend"].append({
        "day": day_idx,
        "date": valid_date_str,
        "model_version": st["current_model_version"],
        "nwp_rain_mae": day_metrics["nwp"]["rain_mae_mm"],
        "ai_rain_mae": day_metrics["ai"]["rain_mae_mm"],
        "ensemble_rain_mae": day_metrics["ensemble"]["rain_mae_mm"],
        "blended_rain_mae": day_metrics["blended"]["rain_mae_mm"],
        "blended_rain_rmse": day_metrics["blended"]["rain_rmse_mm"],
        "blended_rain_bias": day_metrics["blended"]["rain_bias_mm"],
        "W_NWP_pct": pending["weights"]["W_NWP_pct"],
        "W_AI_pct": pending["weights"]["W_AI_pct"],
        "W_Ensemble_pct": pending["weights"]["W_Ensemble_pct"],
    })

    st["activity_log"] = (
        [
            {
                "day": day_idx,
                "date": valid_date_str,
                "event": candidate_event_note,
            }
        ]
        + st["activity_log"]
    )[:25]

    # Step 13: Generate the NEXT day's forecasts using the currently approved model version
    next_dt = valid_dt + timedelta(days=1)
    st["pending_forecast"] = _generate_day_forecasts_and_blend(
        day_index=day_idx + 1,
        sim_date_str=next_dt.strftime("%Y-%m-%d"),
        model=st["active_model_obj"],
        model_version=st["current_model_version"],
        scale=scale,
        rolling_source_errors=st["rolling_source_errors"],
    )

    # Concise generated summary explaining whether performance increased, decreased, or remained unchanged
    trend = st["daily_trend"]
    if len(trend) >= 2:
        first_mae = trend[0]["blended_rain_mae"]
        latest_mae = trend[-1]["blended_rain_mae"]
        mean_blended = round(float(np.mean([t["blended_rain_mae"] for t in trend])), 3)
        mean_nwp = round(float(np.mean([t["nwp_rain_mae"] for t in trend])), 3)
        mean_ai = round(float(np.mean([t["ai_rain_mae"] for t in trend])), 3)
        mean_ens = round(float(np.mean([t["ensemble_rain_mae"] for t in trend])), 3)
        delta = round(latest_mae - first_mae, 3)
        direction = (
            f"improved (error decreased by {abs(delta)} mm)"
            if delta < -0.05
            else f"fluctuated (+{delta} mm due to synoptic surge variance)"
            if delta > 0.05
            else "remained stable"
        )
        st["performance_summary"] = (
            f"Across {len(trend)} completed TimeLoop days (current model: {st['current_model_version']}), "
            f"daily blended rainfall MAE {direction} from {first_mae} mm (Day 1) to {latest_mae} mm (Day {day_idx}). "
            f"Cumulative mean 6h rainfall MAE: FOREXA Blended = {mean_blended} mm vs Ensemble = {mean_ens} mm, "
            f"AI = {mean_ai} mm, and NWP = {mean_nwp} mm."
        )
    else:
        st["performance_summary"] = (
            f"Completed Day 1 ({valid_date_str}): FOREXA Blended 6h rainfall MAE = {day_metrics['blended']['rain_mae_mm']} mm "
            f"(RMSE = {day_metrics['blended']['rain_rmse_mm']} mm, Bias = {day_metrics['blended']['rain_bias_mm']} mm) "
            f"vs NWP = {day_metrics['nwp']['rain_mae_mm']} mm, AI = {day_metrics['ai']['rain_mae_mm']} mm, "
            f"Ensemble = {day_metrics['ensemble']['rain_mae_mm']} mm."
        )


def get_timeloop_public_state() -> dict[str, Any]:
    """Return JSON-serializable TimeLoop state for the frontend UI."""
    global _TIMELOOP_STATE
    if not _TIMELOOP_STATE:
        return reset_timeloop()

    st = _TIMELOOP_STATE
    pending = st["pending_forecast"]
    return {
        "simulation_badge": st["simulation_badge"],
        "observation_badge": st["observation_badge"],
        "start_date": st["start_date"],
        "current_simulated_date": st["current_simulated_date"],
        "completed_cycles": st["completed_cycles"],
        "min_cycles_for_retraining": st["min_cycles_for_retraining"],
        "original_production_model_version": st["original_production_model_version"],
        "previous_model_version": st["previous_model_version"],
        "current_model_version": st["current_model_version"],
        "candidate_status": st["candidate_status"],
        "rolling_source_errors": st["rolling_source_errors"],
        "next_day_forecast_preview": {
            "valid_date": pending["valid_date"],
            "model_version": pending["model_version"],
            "weights": pending["weights"],
        },
        "yesterday_comparison": st["yesterday_comparison"],
        "before_after_metrics": st["before_after_metrics"],
        "daily_trend": st["daily_trend"],
        "version_history": st["version_history"],
        "activity_log": st["activity_log"],
        "performance_summary": st["performance_summary"],
    }
