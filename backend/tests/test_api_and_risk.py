from forexa import api, engine
from forexa.api import HistoricalQuery, FailoverRequest, SourceAvailabilityUpdate, OperationalGuidanceInput
from fastapi import HTTPException
import pytest

AUTH_USER = {"uid": "auth-user-1", "email": "authority@ksdma.kerala.gov.in", "role": "authority"}
TECH_USER = {"uid": "tech-user-1", "email": "scientist@forexa.kerala.gov.in", "role": "technical"}


def test_health_endpoint():
    res = api.health()
    assert res["status"] == "ok"
    assert "active_model_version" in res


def test_authorities_role_cannot_access_technical_endpoints():
    with pytest.raises(HTTPException) as exc:
        api.require_technical(AUTH_USER)
    assert exc.value.status_code == 403

    data = api.get_latest_forecast(lead_h=24, init_time=None, season=None, offline_sources=None, user=AUTH_USER)
    assert len(data["districts"]) == 14
    monitored = [d for d in data["districts"] if d["has_native_station"]]
    unmonitored = [d for d in data["districts"] if not d["has_native_station"]]
    assert len(monitored) == 8
    assert len(unmonitored) == 6
    assert unmonitored[0]["status"] == "NO_SENSOR_FEED"
    assert unmonitored[0]["blended_variables"] is None
    assert "individual_model_predictions" not in monitored[0]
    assert "predicted_source_errors" not in monitored[0]


def test_technical_role_receives_unified_weights_and_model_predictions():
    data = api.get_latest_forecast(lead_h=24, init_time=None, season=None, offline_sources=None, user=TECH_USER)
    monitored = [d for d in data["districts"] if d["has_native_station"]]
    uw = data["unified_weights"]
    assert abs(uw["W_NWP"] + uw["W_Ensemble"] + uw["W_AI"] - 1.0) < 1e-3
    assert uw["shared_across_all_districts_and_variables"] is True

    # Verify all districts receive the exact same unified configuration weights
    w_tuples = {(d["unified_weights"]["W_NWP"], d["unified_weights"]["W_AI"], d["unified_weights"]["W_Ensemble"]) for d in monitored}
    assert len(w_tuples) == 1
    assert "individual_model_predictions" in monitored[0]
    assert "technical_explainability_brief" in monitored[0]

    tl = api.get_district_timeline("Idukki", init_time=None, season=None, offline_sources=None, user=TECH_USER)
    assert len(tl["horizons_6h_to_72h"]) == 12

    unmon_tl = api.get_district_timeline("Kollam", init_time=None, season=None, offline_sources=None, user=TECH_USER)
    assert unmon_tl["has_native_station"] is False
    assert unmon_tl["status"] == "NO_SENSOR_FEED"


def test_extreme_event_identification_separates_meteorological_events_from_impacts():
    data = api.get_latest_forecast(lead_h=24, init_time=None, season="Southwest Monsoon", offline_sources=None, user=TECH_USER)
    monitored = [d for d in data["districts"] if d["has_native_station"]]
    ext = monitored[0]["extreme_event_detail"]
    assert "Transparent Rule-Based Meteorological Detector" in ext["detection_method"]
    assert "XGBoost model predicts source reliability weights only" in ext["detection_method"]
    assert isinstance(ext["detected_meteorological_events"], list)
    assert isinstance(ext["possible_impacts"], list)
    assert "unavailable_variables_in_dataset" in ext


def test_failure_resilience_all_scenarios():
    # 1. NWP offline
    f_nwp = api.simulate_failure(FailoverRequest(offline_sources=["nwp"], district="Idukki", lead_h=24), user=TECH_USER)
    assert f_nwp["after_failure"]["status"] == "REDUCED"
    assert f_nwp["after_failure"]["unified_weights"]["W_NWP"] == 0.0
    assert abs(f_nwp["after_failure"]["unified_weights"]["W_AI"] + f_nwp["after_failure"]["unified_weights"]["W_Ensemble"] - 1.0) < 1e-3

    # 2. AI & NWP offline (single source degraded)
    f_deg = api.simulate_failure(FailoverRequest(offline_sources=["nwp", "ai"], district="Idukki", lead_h=24), user=TECH_USER)
    assert f_deg["after_failure"]["status"] == "DEGRADED"
    assert f_deg["after_failure"]["confidence_level"] == "LOW"
    assert f_deg["after_failure"]["unified_weights"]["W_Ensemble"] == 1.0

    # 3. Invalid source values (NaN injected)
    f_nan = api.simulate_failure(
        FailoverRequest(offline_sources=[], district="Idukki", lead_h=24, simulate_invalid_values=True),
        user=TECH_USER,
    )
    assert f_nan["after_failure"]["blended_variables"]["rainfall_6h_mm"] is not None

    # 4. All 3 sources offline
    f_all = api.simulate_failure(
        FailoverRequest(offline_sources=["nwp", "ai", "ensemble"], district="Idukki", lead_h=24),
        user=TECH_USER,
    )
    assert f_all["after_failure"]["status"] == "UNAVAILABLE"
    assert f_all["after_failure"]["blended_variables"] is None
    assert f_all["after_failure"]["unified_weights"]["W_NWP"] == 0.0
    assert f_all["after_failure"]["unified_weights"]["W_AI"] == 0.0
    assert f_all["after_failure"]["unified_weights"]["W_Ensemble"] == 0.0


def test_control_room_and_continuous_learning_feedback():
    # Toggle source availability and restore
    s1 = api.update_source_availability(SourceAvailabilityUpdate(nwp=False, ai=True, ensemble=True), user=TECH_USER)
    assert "nwp" in s1["offline_sources"]
    s2 = api.update_source_availability(SourceAvailabilityUpdate(nwp=True, ai=True, ensemble=True), user=TECH_USER)
    assert len(s2["offline_sources"]) == 0

    # Add and revert operational guidance
    g_add = api.add_operational_guidance(
        OperationalGuidanceInput(message="Test Urgent Directive", scope="All model sources", priority="Urgent", target_district="Wayanad"),
        user=TECH_USER,
    )
    gid = g_add["added"]["id"]
    g_rev = api.revert_operational_guidance(gid, user=TECH_USER)
    assert all(g["id"] != gid for g in g_rev["control_state"]["operational_guidance"])

    # Continuous learning & feedback ledger
    ledger = api.get_feedback_ledger(limit=10, user=TECH_USER)
    assert ledger["count"] > 0
    assert ledger["is_synthetic_feedback"] is True
    assert ledger["records"][0]["verification_status"] == "VERIFIED"


def test_historical_analogue_and_alerts_and_session_audit():
    hist = api.historical_search(HistoricalQuery(district="Idukki", rain_mm=60.0, duration_h=6, top_k=3), user=TECH_USER)
    assert len(hist["matches"]) == 3
    assert hist["matches"][0]["is_synthetic"] is True

    al = api.get_alerts(status=None, user=AUTH_USER)
    assert "PROTOTYPE" in al["disclaimer"]

    req = api.SessionAuditRequest(
        uid="fb-test-uid-001",
        email="officer@department.gov",
        selected_role="authority",
        action="REGISTER",
        status="SUCCESS",
        state_region="Kerala",
        auth_provider="password",
        user_agent="pytest",
        firestore_synced=True,
    )
    res = api.log_user_session(req)
    assert res["stored"] is True
    assert res["firebase_project_id"] == "forexa-e5dc7"


def test_live_stream_and_timeloop_simulators():
    # 1. Live Stream Simulator
    ls_reset = api.reset_live_stream_api(user=TECH_USER)
    assert ls_reset["simulation_label"] == "SIMULATED LIVE DATA"
    assert ls_reset["tick_minute"] == 0
    w0 = ls_reset["unified_weights"]
    assert abs((w0["W_NWP_pct"] + w0["W_AI_pct"] + w0["W_Ensemble_pct"]) - 100.0) < 0.5

    ls_step = api.step_live_stream_api(
        api.LiveStreamStepRequest(
            advance_minutes=1,
            selected_district="Wayanad",
            force_fail_source="nwp",
        ),
        user=TECH_USER,
    )
    assert ls_step["simulation_label"] == "SIMULATED LIVE DATA"
    assert ls_step["tick_minute"] == 1
    assert ls_step["unified_weights"]["W_NWP_pct"] == 0.0
    assert (
        abs(
            ls_step["unified_weights"]["W_AI_pct"]
            + ls_step["unified_weights"]["W_Ensemble_pct"]
            - 100.0
        )
        < 0.5
    )

    # 2. FOREXA TimeLoop Day-by-Day Learning Simulator
    tl_reset = api.reset_timeloop_api(
        api.TimeLoopResetRequest(start_date="2025-06-01"), user=TECH_USER
    )
    assert tl_reset["observation_badge"] == "SYNTHETIC OBSERVATIONS"
    assert tl_reset["completed_cycles"] == 0

    tl_step = api.step_timeloop_api(
        api.TimeLoopStepRequest(days=3), user=TECH_USER
    )
    assert tl_step["completed_cycles"] == 3
    assert len(tl_step["daily_trend"]) == 3
    assert tl_step["observation_badge"] == "SYNTHETIC OBSERVATIONS"
    assert len(tl_step["version_history"]) >= 2
    assert tl_step["version_history"][0]["status"] in ("PROMOTED", "REJECTED")
    assert len(tl_step["yesterday_comparison"]["districts"]) == 8


def test_district_authority_dispatch_and_offline_sms_failover():
    dist_user = {"uid": "dist-1", "email": "collector@wayanad.gov.in", "role": "district_authority"}
    # Register prototype mobile number
    reg = api.register_prototype_contact(
        api.RegisterContactRequest(
            receiver_mobile="+91 9998887776",
            district="Wayanad",
            email="state@ksdma.gov.in",
            role="authority",
        ),
        user=AUTH_USER,
    )
    assert reg["prototype_receiver_mobile"] == "+91 9998887776"

    # Fetch automated high-priority alert & default report for Wayanad
    st = api.get_district_dispatch_state(district="Wayanad", lead_h=24, user=dist_user)
    assert st["selected_district"] == "Wayanad"
    assert st["prototype_receiver_mobile"] == "+91 9998887776"
    assert st["district_alert"]["auto_routed_from_state_authority"] is True
    assert st["district_final_report"]["district"] == "Wayanad"

    # Simulate recipient going offline -> automatic AI Emergency SMS failover to registered mobile
    off = api.update_district_presence(
        api.PresenceToggleRequest(district="Wayanad", is_online=False),
        user=dist_user,
    )
    assert off["presence"]["is_online"] is False
    assert off["triggered_sms_failover"] is not None
    assert off["triggered_sms_failover"]["target_mobile"] == "+91 9998887776"
    assert off["district_alert"]["delivery_status"] == "OFFLINE_CACHED_AND_SMS_SENT"

    # State Authority dispatches final official report while district is offline -> triggers SMS too
    rep = api.send_final_district_report(
        api.SendDistrictReportRequest(district="Wayanad", lead_h=24, custom_directive="Open 4 relief camps"),
        user=AUTH_USER,
    )
    assert rep["dispatched"] is True
    assert rep["triggered_sms_failover"]["target_mobile"] == "+91 9998887776"

    # Simulate 10-min unacknowledged Cloud Tasks timeout escalation
    esc = api.trigger_unacknowledged_escalation(
        api.EscalateTimeoutRequest(district="Wayanad"),
        user=dist_user,
    )
    assert esc["escalated"] is True
    assert "VOICE_CALL_TRIGGERED" in esc["sms_voice_dispatch"]["voice_call_status"]

    # District Authority acknowledges receipt
    ack = api.acknowledge_district_alert(
        api.AcknowledgeAlertRequest(district="Wayanad", acknowledged_by="collector@wayanad.gov.in"),
        user=dist_user,
    )
    assert ack["acknowledged"] is True
    assert ack["district_alert"]["ack_status"] == "ACKNOWLEDGED"

    # Restore online presence
    api.update_district_presence(
        api.PresenceToggleRequest(district="Wayanad", is_online=True),
        user=dist_user,
    )



