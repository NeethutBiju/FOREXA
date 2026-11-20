import React, { useEffect, useState } from "react";
import {
  Shield,
  Send,
  RotateCcw,
  Wifi,
  WifiOff,
  CheckCircle2,
  Lock,
  Terminal,
  Activity,
  LogIn,
  RefreshCw,
} from "lucide-react";
import {
  ApiStatusState,
  ComputedDistrictForecast,
  fetchFeedbackLedgerApi,
  HumanGuidanceEntry,
  simulateBackendFailureApi,
  triggerContinuousLearningApi,
} from "../utils/forecastEngine";
import { UserSession } from "../firebase";

interface ControlRoomTabProps {
  selectedForecast: ComputedDistrictForecast;
  allForecasts: ComputedDistrictForecast[];
  apiStatus: ApiStatusState;
  guidanceLog: HumanGuidanceEntry[];
  isAdminUnlocked: boolean;
  session: UserSession | null;
  lastBlendTime: string;
  darkMode: boolean;
  onToggleApi: (source: "nwp" | "ai" | "ensemble") => void;
  onApplyGuidance: (entry: {
    message: string;
    scope: string;
    priority: string;
    targetDistrictId: string;
  }) => void;
  onRevertGuidance: (id: string) => void;
  onUnlockAdmin: () => void;
  onNavigateLogin: () => void;
}

export const ControlRoomTab: React.FC<ControlRoomTabProps> = ({
  selectedForecast,
  allForecasts,
  apiStatus,
  guidanceLog,
  isAdminUnlocked,
  session,
  lastBlendTime,
  onToggleApi,
  onApplyGuidance,
  onRevertGuidance,
  onUnlockAdmin,
  onNavigateLogin,
}) => {
  const [message, setMessage] = useState<string>(
    `Elevate landslide & flash-flood vigilance for ${selectedForecast.district.name}; prioritize Ensemble upper-quantile rainfall guidance.`
  );
  const [scope, setScope] = useState<string>("All model sources");
  const [priority, setPriority] = useState<string>("Urgent");
  const [targetDistrictId, setTargetDistrictId] = useState<string>(
    selectedForecast.district.name
  );

  const [feedbackLedger, setFeedbackLedger] = useState<any[]>([]);
  const [clResult, setClResult] = useState<any>(null);
  const [clLoading, setClLoading] = useState<boolean>(false);
  const [failoverDiagResult, setFailoverDiagResult] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState<boolean>(false);

  const onlineCount =
    (apiStatus.nwp ? 1 : 0) +
    (apiStatus.ai ? 1 : 0) +
    (apiStatus.ensemble ? 1 : 0);

  const offlineNames: string[] = [];
  if (!apiStatus.nwp) offlineNames.push("NWP API");
  if (!apiStatus.ai) offlineNames.push("AI API");
  if (!apiStatus.ensemble) offlineNames.push("Ensemble API");

  const activeGuidance = guidanceLog[0] || null;

  useEffect(() => {
    if (!isAdminUnlocked && !session) return;
    fetchFeedbackLedgerApi("technical", session?.idToken)
      .then((res) => setFeedbackLedger(res.records || []))
      .catch(() => {});
  }, [isAdminUnlocked, session]);

  if (!isAdminUnlocked && !session) {
    return (
      <div className="max-w-lg mx-auto my-10 rounded-2xl bg-white border border-slate-200 p-8 text-center shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-[#F5F3FF] text-[#6D28D9] flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-[#6D28D9]">
          FOREXA Control Room Access
        </h2>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">
          Operational guidance injection, backend failure simulation, and
          continuous-learning verification require Technical Professional
          authentication.
        </p>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={onUnlockAdmin}
            className="w-full py-3 rounded-xl bg-[#6D28D9] hover:bg-[#4C1D95] text-white font-semibold text-xs shadow-sm transition flex items-center justify-center gap-2"
          >
            <Shield className="w-4 h-4" />
            <span>Unlock Technical Control Room</span>
          </button>

          <button
            type="button"
            onClick={onNavigateLogin}
            className="w-full py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F3FF] text-slate-700 font-semibold text-xs transition flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4 text-[#6D28D9]" />
            <span>Open Auth Portal (/login)</span>
          </button>
        </div>
      </div>
    );
  }

  const handleSubmitGuidance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    onApplyGuidance({
      message: message.trim(),
      scope,
      priority,
      targetDistrictId,
    });
  };

  const handleRunBackendDiagnostic = async (
    offlineList: string[],
    simInvalid = false
  ) => {
    setDiagLoading(true);
    try {
      const distName = selectedForecast.hasNativeStation
        ? selectedForecast.district.name
        : "Wayanad";
      const res = await simulateBackendFailureApi(
        {
          offline_sources: offlineList,
          district: distName,
          lead_h: 24,
          simulate_invalid_values: simInvalid,
        },
        "technical",
        session?.idToken
      );
      setFailoverDiagResult(res);
    } catch {
      // ignore
    } finally {
      setDiagLoading(false);
    }
  };

  const handleRunContinuousLearning = async () => {
    setClLoading(true);
    try {
      const res = await triggerContinuousLearningApi(
        false,
        "technical",
        session?.idToken
      );
      setClResult(res);
      const ledgerRes = await fetchFeedbackLedgerApi(
        "technical",
        session?.idToken
      );
      setFeedbackLedger(ledgerRes.records || []);
    } catch {
      // ignore
    } finally {
      setClLoading(false);
    }
  };

  const apiCards = [
    {
      id: "nwp" as const,
      title: "NWP API",
      subtitle: "Physics guidance (NOAA GFS)",
      online: apiStatus.nwp,
      weightPct: selectedForecast.weights.nwp,
    },
    {
      id: "ai" as const,
      title: "AI API",
      subtitle: "Pattern guidance (GraphCast)",
      online: apiStatus.ai,
      weightPct: selectedForecast.weights.ai,
    },
    {
      id: "ensemble" as const,
      title: "Ensemble API",
      subtitle: "Scenario guidance (WeatherNext 2)",
      online: apiStatus.ensemble,
      weightPct: selectedForecast.weights.ensemble,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        {/* 5.1 OPERATIONAL GUIDANCE */}
        <div className="lg:col-span-6 rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-bold text-[#6D28D9]">
                  Operational Guidance
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Apply meteorologist directives to the next forecast blend
                </p>
              </div>
              <Terminal className="w-5 h-5 text-[#6D28D9]" />
            </div>

            <form onSubmit={handleSubmitGuidance} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Message to forecasting system
                </label>
                <textarea
                  rows={3}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 text-xs text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#6D28D9] focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Apply to
                  </label>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
                  >
                    <option value="All model sources">All model sources</option>
                    <option value="Blending logic only">
                      Blending logic only
                    </option>
                    <option value="Impact alerts only">
                      Impact alerts only
                    </option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
                  >
                    <option value="Operational">Operational</option>
                    <option value="Urgent">Urgent</option>
                    <option value="Advisory">Advisory</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Target District
                  </label>
                  <select
                    value={targetDistrictId}
                    onChange={(e) => setTargetDistrictId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800"
                  >
                    {allForecasts.map((f) => (
                      <option key={f.district.name} value={f.district.name}>
                        {f.district.name}
                      </option>
                    ))}
                    <option value="all">All 14 Kerala Districts</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#6D28D9] hover:bg-[#4C1D95] text-white font-semibold text-xs shadow-sm transition flex items-center justify-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Apply to Next Blend</span>
              </button>
            </form>
          </div>

          <div className="mt-5">
            {!activeGuidance ? (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-xs font-medium flex items-center justify-between">
                <span>No human guidance applied</span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-white border border-slate-200 text-slate-600 font-semibold">
                  Standby
                </span>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-purple-200 bg-[#F5F3FF] text-slate-800 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#6D28D9]">
                    Active Directive
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#6D28D9] text-white">
                    Active · {activeGuidance.priority}
                  </span>
                </div>
                <p className="font-medium leading-snug">
                  “{activeGuidance.message}”
                </p>
                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Scope: {activeGuidance.scope}</span>
                  <span>Target: {activeGuidance.targetDistrictId}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 5.2 MODEL API FAILURE SIMULATOR */}
        <div className="lg:col-span-6 rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-bold text-[#6D28D9]">
                  Model API Failure Simulator
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Toggle upstream feeds to verify live weight redistribution
                </p>
              </div>

              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F5F3FF] text-[#6D28D9] border border-purple-200">
                <span className="w-2 h-2 rounded-full bg-[#6D28D9]" />
                <span>{onlineCount}/3 online</span>
              </span>
            </div>

            <div className="space-y-3.5">
              {apiCards.map((api) => (
                <div
                  key={api.id}
                  onClick={() => onToggleApi(api.id)}
                  role="switch"
                  aria-checked={api.online}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onToggleApi(api.id);
                    }
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-center justify-between gap-3 ${
                    api.online
                      ? "bg-white border-slate-200 hover:border-[#6D28D9]"
                      : "bg-slate-50 border-slate-200 text-slate-500"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`p-2.5 rounded-xl ${
                        api.online
                          ? "bg-[#F5F3FF] text-[#6D28D9]"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {api.online ? (
                        <Wifi className="w-4 h-4" />
                      ) : (
                        <WifiOff className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {api.title}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            api.online
                              ? "bg-[#F5F3FF] text-[#6D28D9]"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {api.online ? "ONLINE" : "OFFLINE"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {api.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-bold text-[#6D28D9]">
                        {api.weightPct}%
                      </div>
                      <div className="text-[10px] text-slate-400">Weight</div>
                    </div>

                    <div
                      className={`w-11 h-6 rounded-full p-0.5 transition ${
                        api.online ? "bg-[#6D28D9]" : "bg-slate-300"
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full bg-white shadow transform transition ${
                          api.online ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            {onlineCount === 3 ? (
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#6D28D9]" />
                  <span>Normal three-source blend (NWP + AI + Ensemble)</span>
                </span>
                <span className="text-[#6D28D9]">100% Weight Integrity</span>
              </div>
            ) : onlineCount > 0 ? (
              <div className="p-4 rounded-xl border border-purple-200 bg-[#F5F3FF] text-slate-800 text-xs font-semibold flex items-center justify-between">
                <span>
                  {offlineNames.join(" & ")} offline · blend redistributed
                  across remaining {onlineCount} source(s)
                </span>
                <span className="text-[#6D28D9]">Failover Active</span>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-slate-300 bg-slate-100 text-slate-800 text-xs font-semibold flex items-center justify-between">
                <span>No model available · All 3 forecast streams offline</span>
                <span>Unavailable</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BACKEND FAILURE-RESILIENCE DIAGNOSTIC RUNNER */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-[#6D28D9]">
              Backend Failure-Resilience Diagnostic Runner
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verify weight renormalization across individual and multi-source
              dropout scenarios
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={diagLoading}
              onClick={() => handleRunBackendDiagnostic(["nwp"], false)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F3FF] text-slate-700 text-xs font-semibold transition"
            >
              Test NWP Offline
            </button>
            <button
              type="button"
              disabled={diagLoading}
              onClick={() => handleRunBackendDiagnostic(["ai"], false)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F3FF] text-slate-700 text-xs font-semibold transition"
            >
              Test AI Offline
            </button>
            <button
              type="button"
              disabled={diagLoading}
              onClick={() => handleRunBackendDiagnostic(["ensemble"], false)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F3FF] text-slate-700 text-xs font-semibold transition"
            >
              Test Ensemble Offline
            </button>
            <button
              type="button"
              disabled={diagLoading}
              onClick={() => handleRunBackendDiagnostic([], true)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F3FF] text-slate-700 text-xs font-semibold transition"
            >
              Test Invalid Values
            </button>
            <button
              type="button"
              disabled={diagLoading}
              onClick={() =>
                handleRunBackendDiagnostic(["nwp", "ai", "ensemble"], false)
              }
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-[#6D28D9] text-slate-700 hover:text-white text-xs font-semibold transition"
            >
              Test All 3 Offline
            </button>
          </div>
        </div>

        {failoverDiagResult && (
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-slate-700">
            <div>
              <div className="font-bold text-[#6D28D9] mb-1.5">
                Before Failure ({failoverDiagResult.district} +
                {failoverDiagResult.lead_h}h)
              </div>
              <div>
                Status:{" "}
                <strong>{failoverDiagResult.before_failure?.status}</strong> ·
                Confidence:{" "}
                <strong>
                  {failoverDiagResult.before_failure?.confidence_level}
                </strong>
              </div>
              <div className="mt-1">
                Weights: NWP{" "}
                {
                  failoverDiagResult.before_failure?.unified_weights
                    ?.W_NWP_pct
                }
                % · AI{" "}
                {failoverDiagResult.before_failure?.unified_weights?.W_AI_pct}%
                · Ensemble{" "}
                {
                  failoverDiagResult.before_failure?.unified_weights
                    ?.W_Ensemble_pct
                }
                %
              </div>
              <div className="mt-1">
                Blended 6h Rain:{" "}
                <strong>
                  {failoverDiagResult.before_failure?.blended_variables
                    ?.rainfall_6h_mm ?? "—"}{" "}
                  mm
                </strong>
              </div>
            </div>

            <div>
              <div className="font-bold text-[#6D28D9] mb-1.5">
                After Failure (
                {failoverDiagResult.offline_sources?.join(", ") ||
                  "Invalid Value Sanitized"}
                )
              </div>
              <div>
                Status:{" "}
                <strong>{failoverDiagResult.after_failure?.status}</strong> ·
                Fallback:{" "}
                <code>
                  {
                    failoverDiagResult.after_failure?.source_availability
                      ?.fallback_reason
                  }
                </code>
              </div>
              <div className="mt-1">
                Renormalized Weights: NWP{" "}
                {failoverDiagResult.after_failure?.unified_weights?.W_NWP_pct}%
                · AI{" "}
                {failoverDiagResult.after_failure?.unified_weights?.W_AI_pct}% ·
                Ensemble{" "}
                {
                  failoverDiagResult.after_failure?.unified_weights
                    ?.W_Ensemble_pct
                }
                %
              </div>
              <div className="mt-1">
                Recalculated Blended 6h Rain:{" "}
                <strong>
                  {failoverDiagResult.after_failure?.blended_variables
                    ?.rainfall_6h_mm ?? "Unavailable"}
                </strong>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CONTINUOUS LEARNING FEEDBACK LEDGER */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-[#6D28D9]">
              Forecast Verification &amp; Continuous Learning Ledger
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Matched reference observations, source errors, and drift status
            </p>
          </div>

          <button
            type="button"
            disabled={clLoading}
            onClick={handleRunContinuousLearning}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#4C1D95] text-white text-xs font-semibold shadow-sm transition"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${clLoading ? "animate-spin" : ""}`}
            />
            <span>
              {clLoading
                ? "Verifying observations..."
                : "Verify Matured Forecasts & Check Drift"}
            </span>
          </button>
        </div>

        {clResult && (
          <div className="mb-4 p-4 rounded-xl bg-[#F5F3FF] border border-purple-200 text-slate-800 text-xs font-medium">
            <strong className="text-[#6D28D9]">Verified: </strong>
            {clResult.reason} (7d/90d drift ratio:{" "}
            {clResult.drift_ratio_7d_vs_90d} · Active version:{" "}
            {clResult.active_version})
          </div>
        )}

        <div className="overflow-x-auto max-h-[260px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 pr-2">Forecast ID</th>
                <th className="py-2.5 px-2">District &amp; Lead</th>
                <th className="py-2.5 px-2">Valid Time</th>
                <th className="py-2.5 px-2">Unified Weights</th>
                <th className="py-2.5 px-2">Blended vs Obs (6h Rain)</th>
                <th className="py-2.5 px-2">Source Errors (NWP / AI / Ens)</th>
                <th className="py-2.5 pl-2">Blended Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {feedbackLedger.slice(0, 12).map((row) => (
                <tr key={row.forecast_id}>
                  <td className="py-2.5 pr-2 font-mono text-[11px] font-medium">
                    {row.forecast_id}
                  </td>
                  <td className="py-2.5 px-2 font-semibold text-slate-900">
                    {row.district} (+{row.lead_h}h)
                  </td>
                  <td className="py-2.5 px-2 text-slate-500">
                    {row.valid_time}
                  </td>
                  <td className="py-2.5 px-2">
                    N {Math.round((row.adaptive_weights?.W_NWP || 0) * 100)}% ·
                    AI {Math.round((row.adaptive_weights?.W_AI || 0) * 100)}% ·
                    E{" "}
                    {Math.round((row.adaptive_weights?.W_Ensemble || 0) * 100)}%
                  </td>
                  <td className="py-2.5 px-2 font-medium">
                    {row.final_blended_forecast?.precip_6h_mm ?? "—"} mm vs{" "}
                    {row.reference_observation?.precip_6h_mm ?? "—"} mm
                  </td>
                  <td className="py-2.5 px-2 text-slate-500">
                    {row.source_errors?.nwp?.precip_6h_mm ?? "—"} /{" "}
                    {row.source_errors?.ai?.precip_6h_mm ?? "—"} /{" "}
                    {row.source_errors?.ensemble?.precip_6h_mm ?? "—"} mm
                  </td>
                  <td className="py-2.5 pl-2 font-bold text-[#6D28D9]">
                    ±{row.blended_error?.precip_6h_mm ?? "—"} mm
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5.3 APPLIED GUIDANCE LOG */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
        <h3 className="text-base font-bold text-[#6D28D9] mb-3">
          Applied Guidance Log ({guidanceLog.length})
        </h3>

        {guidanceLog.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            No operational guidance directives applied in the current session.
          </p>
        ) : (
          <div className="space-y-3">
            {guidanceLog.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#6D28D9]">
                      {item.timestamp}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F5F3FF] text-[#6D28D9]">
                      {item.priority}
                    </span>
                    <span className="text-slate-500">
                      {item.scope} · Target: {item.targetDistrictId}
                    </span>
                  </div>
                  <p className="font-medium text-slate-800">“{item.message}”</p>
                </div>

                <button
                  type="button"
                  onClick={() => onRevertGuidance(item.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F3FF] text-slate-700 font-semibold text-xs transition"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#6D28D9]" />
                  <span>Revert</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5.4 SYSTEM STATUS STRIP */}
      <div className="rounded-2xl bg-white border border-slate-200/90 px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <Activity className="w-4 h-4 text-[#6D28D9]" />
          <span>
            System Status: {onlineCount}/3 Forecast Streams Healthy · Model:{" "}
            {selectedForecast.modelVersion}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-5 text-xs">
          <span>Last Blend: {lastBlendTime}</span>
          <span>Region: Kerala (14 Districts)</span>
          <span>Session: {session?.email || "Technical Admin"}</span>
        </div>
      </div>
    </div>
  );
};
