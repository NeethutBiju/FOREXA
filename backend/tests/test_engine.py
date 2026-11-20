import numpy as np
import pandas as pd
import pytest

from forexa import config, engine, metrics, storage


def test_circular_wind_direction_blend_wraps_360():
    angles = np.array([[350.0, 10.0, np.nan], [90.0, 270.0, 90.0]])
    weights = np.array([[0.5, 0.5, 0.0], [0.4, 0.2, 0.4]])
    res = metrics.circular_wind_dir_blend(angles, weights)
    assert res[0] == pytest.approx(0.0, abs=1e-2) or res[0] == pytest.approx(360.0, abs=1e-2)
    assert res[1] == pytest.approx(90.0, abs=1e-2)


def test_brier_score_computation():
    prob = pd.Series([80.0, 10.0, 90.0, 20.0])
    obs = pd.Series([15.0, 0.0, 5.0, 0.5])
    bs = metrics.brier_score(prob, obs, thr=2.5)
    expected = np.mean([(0.8 - 1) ** 2, (0.1 - 0) ** 2, (0.9 - 1) ** 2, (0.2 - 0) ** 2])
    assert bs == pytest.approx(expected, abs=1e-4)


def test_district_weights_constraints_and_shared_across_variables():
    wdf = pd.read_parquet(config.PROCESSED_DIR / "weights.parquet")
    blended = pd.read_parquet(config.PROCESSED_DIR / "blended.parquet")

    # 1. Nonnegative and sum to 1.0
    W = wdf[["w_nwp", "w_ensemble", "w_ai"]].to_numpy()
    assert (W >= 0.0).all()
    assert np.allclose(W.sum(axis=1), 1.0, atol=1e-4)

    # 2. Unified configuration weights: for any (init_time, lead_h), all districts share the exact same weights
    cross_dist_std = float(
        wdf.groupby(["init_time", "lead_h"])[["w_nwp", "w_ensemble", "w_ai"]].std().max().max() or 0.0
    )
    assert cross_dist_std < 1e-6

    # 3. Same 3 weights applied across all 5 core weather variables within each district row
    sample = blended.dropna(subset=["temp_c__blend"]).head(25)
    ew = sample[["eff_w_nwp", "eff_w_ensemble", "eff_w_ai"]].to_numpy()
    ew = ew / ew.sum(axis=1, keepdims=True)
    for v in config.VARIABLES:
        F = sample[[f"{v}__nwp", f"{v}__ensemble", f"{v}__ai"]].to_numpy()
        expected = (ew * F).sum(axis=1)
        assert np.allclose(sample[f"{v}__blend"].to_numpy(), expected, atol=5e-2)


def test_extreme_event_extraction_skill_matrix_and_automatic_priority_switching():
    cat = pd.read_parquet(config.PROCESSED_DIR / "extreme_events_catalog.parquet")
    mat = pd.read_parquet(config.PROCESSED_DIR / "extreme_skill_matrix.parquet")
    wdf = pd.read_parquet(config.PROCESSED_DIR / "weights.parquet")

    # 1. Preprocessing extracted historical extreme events
    assert len(cat) > 1000
    assert "EXTREME_RAINFALL" in set(cat["event_type"])

    # 2. Skill matrix evaluates all 3 models per (event_type, district, lead_h)
    assert set(mat["model"]) == {"nwp", "ensemble", "ai"}
    assert "best_model_for_event" in mat.columns

    # 3. Automatic live priority switching gives the best-performing extreme model higher priority
    # during EXTREME_RAINFALL vs NORMAL_WEATHER and automatically reverts when configuration extreme_prob == 0
    normal_cfg_rows = wdf[wdf["priority_mode"] == "NORMAL_ADAPTIVE"]
    extreme_rows = wdf[wdf["live_event_type"] == "EXTREME_RAINFALL"]
    assert len(normal_cfg_rows) > 1000
    assert (normal_cfg_rows["extreme_prob"] == 0.0).all()
    assert (extreme_rows["priority_mode"] == "EXTREME_EVENT_PRIORITY_BOOST").all()
    assert (extreme_rows["extreme_prob"] >= 0.85).all()

    # Best model for EXTREME_RAINFALL (ensemble) receives significantly higher mean weight during EXTREME_RAINFALL than NORMAL_ADAPTIVE
    assert extreme_rows["w_ensemble"].mean() > normal_cfg_rows["w_ensemble"].mean()


def test_crisp_technical_explainability_brief_contains_all_required_telemetry():
    blended = pd.read_parquet(config.PROCESSED_DIR / "blended.parquet")
    ext_row = blended[blended["live_event_type"] == "EXTREME_RAINFALL"].iloc[0]
    brief = engine.build_technical_explainability_brief(ext_row)
    for token in ("EXTREME_EVENT_PRIORITY_BOOST", "EXTREME_RAINFALL", "W_NWP=", "W_Ensemble=", "W_AI=", "disagreement=", "Confidence="):
        assert token in brief

    shap_info = storage.get_kv("shap", {})
    assert "executive_technical_brief" in shap_info
    assert "monotone_constraints_enforced" in shap_info


def test_causal_no_future_leakage_in_rolling_features():
    lf = pd.read_parquet(config.PROCESSED_DIR / "training_features.parquet")
    sub = lf[(lf["district"] == "Ernakulam") & (lf["lead_h"] == 72) & (lf["model"] == "nwp")].sort_values("init_time")
    assert not np.allclose(sub["recent_err_7d"].iloc[50:100], sub["target"].iloc[50:100])


def test_failure_resilience_redistribution_and_degraded_flags():
    wdf = pd.read_parquet(config.PROCESSED_DIR / "weights.parquet").head(16)
    panel = engine.build_panel().head(16)
    scale = engine.climatology_scale(engine.build_panel())
    panel = engine.add_row_metrics(panel, scale)

    b1 = engine.blend(panel, wdf, force_unavailable={"ai"})
    assert (b1["eff_w_ai"] == 0.0).all()
    assert np.allclose((b1["eff_w_nwp"] + b1["eff_w_ensemble"]).to_numpy(), 1.0, atol=1e-3)
    assert (b1["status"] == "REDUCED").all()
    assert (b1["fallback_reason"] == "ai_unavailable_redistributed").all()

    b2 = engine.blend(panel, wdf, force_unavailable={"nwp", "ensemble"})
    b2 = engine.confidence(b2, {"disagreement": 1.0, "spread": 5.0, "pred_err": 0.5})
    assert (b2["status"] == "DEGRADED").all()
    assert (b2["confidence"] == "LOW").all()

    b3 = engine.blend(panel, wdf, force_unavailable={"nwp", "ensemble", "ai"})
    assert (b3["status"] == "UNAVAILABLE").all()
    assert b3["precip_6h_mm__blend"].isna().all()
