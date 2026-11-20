import React, { useEffect, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  BarChart3,
  Radio,
  Clock,
  Layers,
  Award,
  CheckCircle2,
  Activity,
  History,
  WifiOff,
} from "lucide-react";
import {
  ComputedDistrictForecast,
  fetchLiveStreamStateApi,
  fetchTimeLoopStateApi,
  HorizonHours,
  resetLiveStreamApi,
  resetTimeLoopApi,
  stepLiveStreamApi,
  stepTimeLoopApi,
} from "../utils/forecastEngine";
import { UserSession } from "../firebase";

interface VisualizationTabProps {
  allForecasts: ComputedDistrictForecast[];
  selectedForecast: ComputedDistrictForecast;
  leadTime: HorizonHours;
  session: UserSession | null;
  onSelectDistrict: (districtName: string) => void;
}

export const VisualizationTab: React.FC<VisualizationTabProps> = ({
  allForecasts,
  selectedForecast,
  leadTime,
  session,
  onSelectDistrict,
}) => {
  // Active sub-mode inside Visualization tab so it stays spacious and never congested
  const [activeSection, setActiveSection] = useState<
    "blending" | "livestream" | "timeloop"
  >("blending");

  /* ==========================================================================
   * A. LIVE STREAM SIMULATOR STATE
   * ========================================================================== */
  const [liveState, setLiveState] = useState<any>(null);
  const [liveRunning, setLiveRunning] = useState<boolean>(false);
  const [liveFocusDistrict, setLiveFocusDistrict] = useState<string>("Wayanad");
  const [liveFailSource, setLiveFailSource] = useState<string | null>(null);

  useEffect(() => {
    fetchLiveStreamStateApi(session?.idToken)
      .then(setLiveState)
      .catch(() => {});
  }, [session?.idToken]);

  useEffect(() => {
    if (!liveRunning) return;
    const interval = setInterval(() => {
      stepLiveStreamApi(1, liveFocusDistrict, liveFailSource, session?.idToken)
        .then(setLiveState)
        .catch(() => {});
    }, 1800);
    return () => clearInterval(interval);
  }, [liveRunning, liveFocusDistrict, liveFailSource, session?.idToken]);

  const handleStepLiveStream = async (mins = 1) => {
    const next = await stepLiveStreamApi(
      mins,
      liveFocusDistrict,
      liveFailSource,
      session?.idToken
    );
    setLiveState(next);
  };

  const handleResetLiveStream = async () => {
    setLiveRunning(false);
    setLiveFailSource(null);
    const res = await resetLiveStreamApi(session?.idToken);
    setLiveState(res);
  };

  /* ==========================================================================
   * B. FOREXA TIMELOOP SIMULATOR STATE
   * ========================================================================== */
  const [timeLoopState, setTimeLoopState] = useState<any>(null);
  const [timeLoopRunning, setTimeLoopRunning] = useState<boolean>(false);
  const [timeLoopStartDate, setTimeLoopStartDate] =
    useState<string>("2025-06-01");
  const [timeLoopBusy, setTimeLoopBusy] = useState<boolean>(false);

  useEffect(() => {
    fetchTimeLoopStateApi(session?.idToken)
      .then(setTimeLoopState)
      .catch(() => {});
  }, [session?.idToken]);

  useEffect(() => {
    if (!timeLoopRunning) return;
    const interval = setInterval(() => {
      stepTimeLoopApi(1, session?.idToken)
        .then(setTimeLoopState)
        .catch(() => {});
    }, 2200);
    return () => clearInterval(interval);
  }, [timeLoopRunning, session?.idToken]);

  const handleAdvanceTimeLoop = async (days: number) => {
    setTimeLoopBusy(true);
    try {
      const next = await stepTimeLoopApi(days, session?.idToken);
      setTimeLoopState(next);
    } finally {
      setTimeLoopBusy(false);
    }
  };

  const handleResetTimeLoop = async () => {
    setTimeLoopRunning(false);
    setTimeLoopBusy(true);
    try {
      const res = await resetTimeLoopApi(timeLoopStartDate, session?.idToken);
      setTimeLoopState(res);
    } finally {
      setTimeLoopBusy(false);
    }
  };

  const monitoredForecasts = allForecasts.filter((f) => f.hasNativeStation);
  const maxDistrictRain = Math.max(
    50,
    ...monitoredForecasts.map((f) => f.rain6hMm || 0)
  );

  return (
    <div className="space-y-8">
      {/* ====================================================================
       * TOP HEADER & SUB-SECTION SWITCHER
       * ==================================================================== */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#6D28D9]">
            Forecast Blending Analytics &amp; Simulation Suite
          </span>
          <h1 className="text-xl font-bold text-slate-900 mt-1">
            Visualization &amp; Continuous Learning Simulators
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Explore state-wide dynamic blending charts, the Live Stream
            Simulator, and the FOREXA TimeLoop Day-by-Day Learning Simulator
          </p>
        </div>

        {/* Clean 3-Mode Pill Switcher */}
        <div className="inline-flex p-1.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold gap-1">
          <button
            type="button"
            onClick={() => setActiveSection("blending")}
            className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition ${
              activeSection === "blending"
                ? "bg-[#6D28D9] text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>1. District Blending &amp; Priority Charts</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("livestream")}
            className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition ${
              activeSection === "livestream"
                ? "bg-[#6D28D9] text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>2. Live Stream Simulator</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection("timeloop")}
            className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition ${
              activeSection === "timeloop"
                ? "bg-[#6D28D9] text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>3. FOREXA TimeLoop Simulator</span>
          </button>
        </div>
      </div>

      {/* ====================================================================
       * SECTION 1: STATE-WIDE DISTRICT BLENDING & PRIORITY CHARTS
       * ==================================================================== */}
      {activeSection === "blending" && (
        <div className="space-y-8">
          {/* 1A. High-Priority Districts Bar Chart (All Districts in Kerala) */}
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-base font-bold text-[#6D28D9]">
                  High-Priority Districts Ranking Across Kerala (+{leadTime}h
                  Horizon)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Districts ranked by blended rainfall intensity and priority
                  alert status. Click any bar to inspect that district.
                </p>
              </div>
              <div className="px-3.5 py-1.5 rounded-xl bg-[#F5F3FF] text-[#6D28D9] text-xs font-semibold">
                Unified Weights: NWP {selectedForecast.weights.nwp}% · AI{" "}
                {selectedForecast.weights.ai}% · Ensemble{" "}
                {selectedForecast.weights.ensemble}%
              </div>
            </div>

            <div className="space-y-4">
              {allForecasts.map((f) => {
                const rain = f.rain6hMm ?? 0;
                const widthPct = f.hasNativeStation
                  ? Math.min(100, Math.max(6, (rain / maxDistrictRain) * 100))
                  : 0;
                const isHighPriority =
                  f.hasNativeStation &&
                  (f.severity === "RED" ||
                    f.severity === "ORANGE" ||
                    rain >= 30);
                const isSelected =
                  f.district.name === selectedForecast.district.name;

                return (
                  <div
                    key={f.district.name}
                    onClick={() => onSelectDistrict(f.district.name)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? "border-[#6D28D9] bg-[#F5F3FF]/40"
                        : "border-slate-100 hover:border-purple-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-[#F5F3FF] text-[#6D28D9] font-bold flex items-center justify-center text-[11px]">
                          #{f.rank}
                        </span>
                        <span className="font-bold text-slate-900 text-sm">
                          {f.district.name}
                        </span>
                        {isHighPriority && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#6D28D9] text-white">
                            HIGH PRIORITY
                          </span>
                        )}
                        <span className="text-slate-500">{f.eventType}</span>
                      </div>

                      <div className="font-bold text-slate-900">
                        {f.hasNativeStation
                          ? `${rain} mm / 6h (${f.rainRateMmH} mm/h)`
                          : "Unmonitored in dataset"}
                      </div>
                    </div>

                    <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden">
                      {f.hasNativeStation && (
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${widthPct}%`,
                            backgroundColor: isHighPriority
                              ? "#6D28D9"
                              : "#A78BFA",
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 1B. District-by-District Forecast Blending Bar Chart (NWP vs AI vs Ensemble vs Final Blend) */}
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-base font-bold text-[#6D28D9]">
                  State-Wide Multi-Model Blending Comparison by District (+
                  {leadTime}h)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Visualizing how NWP ({selectedForecast.weights.nwp}%), AI (
                  {selectedForecast.weights.ai}%), and Ensemble (
                  {selectedForecast.weights.ensemble}%) combine into the Final
                  Blended Forecast for each monitored district
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-300 inline-block" />
                  NWP
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#C4B5FD] inline-block" />
                  AI
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#8B5CF6] inline-block" />
                  Ensemble
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#6D28D9] inline-block" />
                  Final Blend
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {monitoredForecasts.map((f) => {
                const ind = f.modelVariablesAtHorizon;
                const nwpVal = ind.nwp?.precip_6h_mm ?? 0;
                const aiVal = ind.ai?.precip_6h_mm ?? 0;
                const ensVal = ind.ensemble?.precip_6h_mm ?? 0;
                const blendVal = f.rain6hMm ?? 0;
                const localMax = Math.max(
                  45,
                  nwpVal,
                  aiVal,
                  ensVal,
                  blendVal
                );

                const bars = [
                  {
                    label: `NWP (${f.weights.nwp}%)`,
                    val: nwpVal,
                    color: "#CBD5E1",
                  },
                  {
                    label: `AI (${f.weights.ai}%)`,
                    val: aiVal,
                    color: "#C4B5FD",
                  },
                  {
                    label: `Ens (${f.weights.ensemble}%)`,
                    val: ensVal,
                    color: "#8B5CF6",
                  },
                  {
                    label: "Final Blend",
                    val: blendVal,
                    color: "#6D28D9",
                    bold: true,
                  },
                ];

                return (
                  <div
                    key={f.district.name}
                    onClick={() => onSelectDistrict(f.district.name)}
                    className="p-5 rounded-2xl border border-slate-200 hover:border-[#6D28D9] cursor-pointer transition bg-white"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-slate-900">
                        {f.district.name}
                      </h3>
                      <span className="text-xs font-bold text-[#6D28D9]">
                        {blendVal} mm
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {bars.map((b) => (
                        <div key={b.label}>
                          <div className="flex justify-between text-[11px] mb-1">
                            <span
                              className={
                                b.bold
                                  ? "font-bold text-[#6D28D9]"
                                  : "text-slate-500"
                              }
                            >
                              {b.label}
                            </span>
                            <span
                              className={
                                b.bold
                                  ? "font-bold text-slate-900"
                                  : "text-slate-600"
                              }
                            >
                              {b.val} mm
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (b.val / localMax) * 100
                                )}%`,
                                backgroundColor: b.color,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 1C. How the Blend & Dynamic Weights Change Over Lead Time (6h to 72h) for Selected District */}
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-base font-bold text-[#6D28D9]">
                  How the Forecast Blend Evolves Over Lead Time (6h–72h) ·{" "}
                  {selectedForecast.district.name}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Horizon-by-horizon breakdown of NWP, AI, Ensemble, and Final
                  Blended rainfall across 6h to 72h
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-[#6D28D9]">
                  Select District:
                </label>
                <select
                  value={selectedForecast.district.name}
                  onChange={(e) => onSelectDistrict(e.target.value)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800"
                >
                  {monitoredForecasts.map((f) => (
                    <option key={f.district.name} value={f.district.name}>
                      #{f.rank} {f.district.name} ({f.rain6hMm} mm)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Vertical Bar Chart across 6h..72h */}
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-3 items-end pt-4 pb-2">
              {selectedForecast.hourlySeries.map((pt) => {
                const seriesMax = Math.max(
                  45,
                  ...selectedForecast.hourlySeries.map((s) => s.blended ?? 0)
                );
                const hPct = Math.min(
                  100,
                  Math.max(8, ((pt.blended ?? 0) / seriesMax) * 100)
                );
                const wAtH =
                  selectedForecast.weightsOverLeadTime.find(
                    (w) => w.h === pt.h
                  ) || {
                    nwp: selectedForecast.weights.nwp,
                    ai: selectedForecast.weights.ai,
                    ensemble: selectedForecast.weights.ensemble,
                  };

                return (
                  <div
                    key={pt.h}
                    className="flex flex-col items-center text-center"
                  >
                    <div className="text-[11px] font-bold text-slate-800 mb-1.5">
                      {pt.blended ?? "—"}
                    </div>
                    <div className="w-full h-36 bg-slate-50 rounded-xl border border-slate-100 flex items-end p-1.5">
                      <div
                        className="w-full rounded-lg transition-all duration-300"
                        style={{
                          height: `${hPct}%`,
                          backgroundColor:
                            pt.h === leadTime ? "#4C1D95" : "#6D28D9",
                        }}
                        title={`+${pt.h}h: Blended ${pt.blended} mm (Weights: NWP ${wAtH.nwp}%, AI ${wAtH.ai}%, Ens ${wAtH.ensemble}%)`}
                      />
                    </div>
                    <div className="text-xs font-bold text-[#6D28D9] mt-2">
                      +{pt.h}h
                    </div>
                    <div className="text-[10px] text-slate-400">
                      E:{wAtH.ensemble}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
       * SECTION 2: SIMULATION MODE A — LIVE STREAM SIMULATOR
       * ==================================================================== */}
      {activeSection === "livestream" && liveState && (
        <div className="space-y-8">
          {/* Top Control Bar with Clear SIMULATED LIVE DATA Badge */}
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#F5F3FF] text-[#6D28D9] border border-purple-200">
                    {liveState.simulation_label || "SIMULATED LIVE DATA"}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    Minute +{liveState.tick_minute} ·{" "}
                    {liveState.simulated_timestamp_utc}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-2">
                  Live Stream Simulator · Minute-by-Minute Adaptive Blending
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Generates meteorologically coherent synthetic forecast updates
                  and updates the trained XGBoost adaptive weighting engine in
                  real time. Separate from baseline production API data.
                </p>
              </div>

              {/* Start / Pause / Step / Reset Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                {!liveRunning ? (
                  <button
                    type="button"
                    onClick={() => setLiveRunning(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#4C1D95] text-white text-xs font-semibold shadow-sm transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>
                      {liveState.tick_minute > 0 ? "Resume Stream" : "Start Stream"}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLiveRunning(false)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-xs font-semibold shadow-sm transition"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause Stream</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleStepLiveStream(1)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F3FF] text-slate-700 text-xs font-semibold transition"
                >
                  <FastForward className="w-3.5 h-3.5 text-[#6D28D9]" />
                  <span>Step +1 Min</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setLiveFailSource((prev) => (prev === "nwp" ? null : "nwp"))
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F3FF] text-slate-700 text-xs font-semibold transition"
                >
                  <WifiOff className="w-3.5 h-3.5 text-[#6D28D9]" />
                  <span>
                    {liveFailSource === "nwp"
                      ? "Recover NWP Feed"
                      : "Simulate NWP Drop"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleResetLiveStream}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Live Weather Event Phase & Adaptive Weights Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-xs font-bold text-[#6D28D9]">
                  Simulated Weather Regime Phase
                </div>
                <div className="text-sm font-bold text-slate-900 mt-1">
                  {liveState.event_phase}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  NWP: {liveState.source_status?.nwp} · AI:{" "}
                  {liveState.source_status?.ai} · Ensemble:{" "}
                  {liveState.source_status?.ensemble}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-xs font-bold text-[#6D28D9]">
                  Live Adaptive Weights ({liveState.model_version})
                </div>
                <div className="flex items-center justify-between text-sm font-bold text-slate-900 mt-1">
                  <span>NWP: {liveState.unified_weights?.W_NWP_pct}%</span>
                  <span>AI: {liveState.unified_weights?.W_AI_pct}%</span>
                  <span className="text-[#6D28D9]">
                    Ensemble: {liveState.unified_weights?.W_Ensemble_pct}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden flex mt-2">
                  <div
                    style={{
                      width: `${liveState.unified_weights?.W_NWP_pct || 0}%`,
                    }}
                    className="bg-slate-400"
                  />
                  <div
                    style={{
                      width: `${liveState.unified_weights?.W_AI_pct || 0}%`,
                    }}
                    className="bg-[#8B5CF6]"
                  />
                  <div
                    style={{
                      width: `${
                        liveState.unified_weights?.W_Ensemble_pct || 0
                      }%`,
                    }}
                    className="bg-[#6D28D9]"
                  />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#F5F3FF] border border-purple-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#6D28D9]">
                    Focus District Telemetry
                  </span>
                  <select
                    value={liveFocusDistrict}
                    onChange={(e) => setLiveFocusDistrict(e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-purple-200 bg-white text-xs font-bold text-slate-800"
                  >
                    {(liveState.districts || []).map((d: any) => (
                      <option key={d.district} value={d.district}>
                        {d.district}
                      </option>
                    ))}
                  </select>
                </div>
                {liveState.focus_district_telemetry && (
                  <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                    <div>
                      <span className="text-slate-500">Rain:</span>{" "}
                      <strong className="text-slate-900">
                        {
                          liveState.focus_district_telemetry.blended
                            ?.precip_6h_mm
                        }{" "}
                        mm
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Temp:</span>{" "}
                      <strong className="text-slate-900">
                        {liveState.focus_district_telemetry.blended?.temp_c}°C
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Wind:</span>{" "}
                      <strong className="text-slate-900">
                        {liveState.focus_district_telemetry.blended?.wind_ms}{" "}
                        m/s
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Live Stream District Cards Grid */}
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
            <h3 className="text-base font-bold text-[#6D28D9] mb-4">
              Live Stream District Blended Outputs (Minute +
              {liveState.tick_minute})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {(liveState.districts || []).map((d: any) => (
                <div
                  key={d.district}
                  className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">
                      {d.district}
                    </span>
                    <span className="text-xs font-semibold text-[#6D28D9]">
                      {d.event_type}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl">
                    <div>
                      Rain:{" "}
                      <strong className="text-slate-900">
                        {d.blended.precip_6h_mm} mm
                      </strong>
                    </div>
                    <div>
                      Temp:{" "}
                      <strong className="text-slate-900">
                        {d.blended.temp_c}°C
                      </strong>
                    </div>
                    <div>
                      Humidity:{" "}
                      <strong className="text-slate-900">
                        {d.blended.humidity_pct}%
                      </strong>
                    </div>
                    <div>
                      Wind:{" "}
                      <strong className="text-slate-900">
                        {d.blended.wind_ms} m/s
                      </strong>
                    </div>
                    <div className="col-span-2">
                      Pressure:{" "}
                      <strong className="text-slate-900">
                        {d.blended.pressure_hpa} hPa
                      </strong>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 flex justify-between">
                    <span>NWP: {d.sources.nwp.precip_6h_mm} mm</span>
                    <span>AI: {d.sources.ai.precip_6h_mm} mm</span>
                    <span className="font-semibold text-[#6D28D9]">
                      Ens: {d.sources.ensemble.precip_6h_mm} mm
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
       * SECTION 3: SIMULATION MODE B — FOREXA TIMELOOP (DAY-BY-DAY LEARNING)
       * ==================================================================== */}
      {activeSection === "timeloop" && timeLoopState && (
        <div className="space-y-8">
          {/* TimeLoop Control Header */}
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#F5F3FF] text-[#6D28D9] border border-purple-200">
                    {timeLoopState.simulation_badge}
                  </span>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                    {timeLoopState.observation_badge}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-2">
                  FOREXA TimeLoop — Day-by-Day Forecast Learning Simulator
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Evaluates yesterday’s forecasts against independent synthetic
                  observations, tracks source errors, and trains/validates
                  candidate XGBoost models without altering the original
                  production artifact.
                </p>
              </div>

              {/* Start / Pause / Step +1 Day / Step +3 Days / Reset Controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                <input
                  type="date"
                  value={timeLoopStartDate}
                  onChange={(e) => setTimeLoopStartDate(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                  aria-label="Simulated start date"
                />

                {!timeLoopRunning ? (
                  <button
                    type="button"
                    onClick={() => setTimeLoopRunning(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#6D28D9] hover:bg-[#4C1D95] text-white text-xs font-semibold shadow-sm transition"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>
                      {timeLoopState.completed_cycles > 0
                        ? "Resume Auto-Days"
                        : "Start TimeLoop"}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setTimeLoopRunning(false)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-xs font-semibold shadow-sm transition"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={timeLoopBusy}
                  onClick={() => handleAdvanceTimeLoop(1)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-[#F5F3FF] text-slate-700 text-xs font-semibold transition"
                >
                  <FastForward className="w-3.5 h-3.5 text-[#6D28D9]" />
                  <span>Advance +1 Day</span>
                </button>

                <button
                  type="button"
                  disabled={timeLoopBusy}
                  onClick={() => handleAdvanceTimeLoop(3)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-purple-200 bg-[#F5F3FF] hover:bg-[#6D28D9] text-[#6D28D9] hover:text-white text-xs font-semibold transition"
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>+3 Days (Candidate Gate)</span>
                </button>

                <button
                  type="button"
                  disabled={timeLoopBusy}
                  onClick={handleResetTimeLoop}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Key Status Metrics Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-xs font-bold text-[#6D28D9]">
                  Simulated Date &amp; Cycles
                </div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {timeLoopState.current_simulated_date} · Day{" "}
                  {timeLoopState.completed_cycles}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Next forecast date:{" "}
                  {timeLoopState.next_day_forecast_preview?.valid_date}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-xs font-bold text-[#6D28D9]">
                  Active &amp; Previous Model Version
                </div>
                <div className="text-sm font-bold text-slate-900 mt-1">
                  Active: {timeLoopState.current_model_version}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Previous: {timeLoopState.previous_model_version}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                <div className="text-xs font-bold text-[#6D28D9]">
                  Candidate Model Status
                </div>
                <div className="text-sm font-bold text-slate-900 mt-1">
                  {timeLoopState.candidate_status}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Retrains every {timeLoopState.min_cycles_for_retraining}{" "}
                  verified days
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#F5F3FF] border border-purple-200">
                <div className="text-xs font-bold text-[#6D28D9]">
                  Next-Day Approved Weights
                </div>
                <div className="text-sm font-bold text-slate-900 mt-1">
                  NWP{" "}
                  {
                    timeLoopState.next_day_forecast_preview?.weights
                      ?.W_NWP_pct
                  }
                  % · AI{" "}
                  {timeLoopState.next_day_forecast_preview?.weights?.W_AI_pct}%
                  · Ens{" "}
                  {
                    timeLoopState.next_day_forecast_preview?.weights
                      ?.W_Ensemble_pct
                  }
                  %
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Applied to{" "}
                  {timeLoopState.next_day_forecast_preview?.valid_date}
                </div>
              </div>
            </div>

            {/* Generated Performance Summary Banner */}
            <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
              <strong className="text-[#6D28D9]">
                Continuous Learning Summary:{" "}
              </strong>
              {timeLoopState.performance_summary}
            </div>
          </div>

          {/* YESTERDAY'S FORECAST VS TODAY'S SYNTHETIC OBSERVATION + SOURCE-WISE ERRORS */}
          {timeLoopState.yesterday_comparison ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
              {/* District Comparison Table (7 cols) */}
              <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#6D28D9]">
                      Yesterday’s Forecast vs Today’s Synthetic Observation (
                      {timeLoopState.yesterday_comparison.valid_date})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Matched by district and valid date · All observations
                      independently simulated
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                    SYNTHETIC OBSERVATIONS
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                        <th className="py-2.5 pr-2">District</th>
                        <th className="py-2.5 px-2">Synthetic Obs</th>
                        <th className="py-2.5 px-2">NWP</th>
                        <th className="py-2.5 px-2">AI</th>
                        <th className="py-2.5 px-2">Ensemble</th>
                        <th className="py-2.5 px-2">Final Blended</th>
                        <th className="py-2.5 pl-2">Blended Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {timeLoopState.yesterday_comparison.districts.map(
                        (r: any) => (
                          <tr key={r.district}>
                            <td className="py-2.5 pr-2 font-bold text-slate-900">
                              {r.district}
                            </td>
                            <td className="py-2.5 px-2 font-semibold">
                              {r.observed_rain_mm} mm
                            </td>
                            <td className="py-2.5 px-2 text-slate-500">
                              {r.nwp_rain_mm} mm
                            </td>
                            <td className="py-2.5 px-2 text-slate-500">
                              {r.ai_rain_mm} mm
                            </td>
                            <td className="py-2.5 px-2 text-slate-600">
                              {r.ensemble_rain_mm} mm
                            </td>
                            <td className="py-2.5 px-2 font-bold text-[#6D28D9]">
                              {r.blended_rain_mm} mm
                            </td>
                            <td className="py-2.5 pl-2 font-semibold text-slate-900">
                              ±{r.blended_abs_err_mm} mm
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Source-Wise Error Bar Chart & Before/After Candidate Metrics (5 cols) */}
              <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm flex flex-col justify-between space-y-6">
                <div>
                  <h3 className="text-base font-bold text-[#6D28D9] mb-1">
                    Source-Wise &amp; Blended Error Comparison
                  </h3>
                  <p className="text-xs text-slate-500 mb-4">
                    MAE, RMSE, and Bias on Day{" "}
                    {timeLoopState.completed_cycles} (
                    {timeLoopState.yesterday_comparison.valid_date})
                  </p>

                  {(() => {
                    const m = timeLoopState.yesterday_comparison.metrics;
                    const maxMae = Math.max(
                      10,
                      m.nwp.rain_mae_mm,
                      m.ai.rain_mae_mm,
                      m.ensemble.rain_mae_mm,
                      m.blended.rain_mae_mm
                    );
                    const rows = [
                      {
                        label: "NWP Forecast Error",
                        data: m.nwp,
                        color: "#CBD5E1",
                      },
                      {
                        label: "AI Forecast Error",
                        data: m.ai,
                        color: "#C4B5FD",
                      },
                      {
                        label: "Ensemble Forecast Error",
                        data: m.ensemble,
                        color: "#8B5CF6",
                      },
                      {
                        label: "FOREXA Blended Error",
                        data: m.blended,
                        color: "#6D28D9",
                        highlight: true,
                      },
                    ];
                    return (
                      <div className="space-y-3.5">
                        {rows.map((item) => (
                          <div key={item.label}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span
                                className={
                                  item.highlight
                                    ? "font-bold text-[#6D28D9]"
                                    : "font-medium text-slate-700"
                                }
                              >
                                {item.label}
                              </span>
                              <span className="text-slate-600 font-semibold">
                                MAE {item.data.rain_mae_mm} mm · RMSE{" "}
                                {item.data.rain_rmse_mm} mm · Bias{" "}
                                {item.data.rain_bias_mm} mm
                              </span>
                            </div>
                            <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (item.data.rain_mae_mm / maxMae) * 100
                                  )}%`,
                                  backgroundColor: item.color,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Before vs After Candidate Training Validation Box */}
                {timeLoopState.before_after_metrics && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#6D28D9]">
                        Candidate Validation Gate (Day{" "}
                        {timeLoopState.before_after_metrics.evaluated_on_day})
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F5F3FF] text-[#6D28D9]">
                        {timeLoopState.before_after_metrics.promoted
                          ? "PROMOTED"
                          : "REJECTED"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                        <div className="text-[10px] font-semibold text-slate-400">
                          Before Training (
                          {timeLoopState.before_after_metrics.incumbent_version}
                          )
                        </div>
                        <div className="font-bold text-slate-800 mt-0.5">
                          MAE:{" "}
                          {
                            timeLoopState.before_after_metrics.before_training
                              .mae
                          }
                        </div>
                        <div className="text-[11px] text-slate-500">
                          RMSE:{" "}
                          {
                            timeLoopState.before_after_metrics.before_training
                              .rmse
                          }{" "}
                          · Bias:{" "}
                          {
                            timeLoopState.before_after_metrics.before_training
                              .bias
                          }
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white border border-purple-200">
                        <div className="text-[10px] font-semibold text-[#6D28D9]">
                          After Training (
                          {timeLoopState.before_after_metrics.candidate_version}
                          )
                        </div>
                        <div className="font-bold text-[#6D28D9] mt-0.5">
                          MAE:{" "}
                          {
                            timeLoopState.before_after_metrics.after_training
                              .mae
                          }
                        </div>
                        <div className="text-[11px] text-slate-500">
                          RMSE:{" "}
                          {
                            timeLoopState.before_after_metrics.after_training
                              .rmse
                          }{" "}
                          · Bias:{" "}
                          {
                            timeLoopState.before_after_metrics.after_training
                              .bias
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-slate-200/90 p-8 text-center shadow-sm">
              <h3 className="text-base font-bold text-[#6D28D9]">
                Ready to Start Day 1 Verification
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Click “Advance +1 Day” or “Start TimeLoop” above to advance the
                simulated clock, generate today’s independent synthetic
                observations, and evaluate yesterday’s forecast.
              </p>
            </div>
          )}

          {/* PERFORMANCE TREND OVER SIMULATED DAYS + MODEL VERSION HISTORY & ACTIVITY LOG */}
          {timeLoopState.daily_trend &&
            timeLoopState.daily_trend.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
                {/* Performance Trend Chart (7 cols) */}
                <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
                  <h3 className="text-base font-bold text-[#6D28D9] mb-1">
                    Model Performance Trend Over Simulated Days (Rainfall MAE)
                  </h3>
                  <p className="text-xs text-slate-500 mb-5">
                    Daily 6h rainfall MAE (mm) for FOREXA Blended vs individual
                    models across completed TimeLoop cycles
                  </p>

                  <div className="space-y-3">
                    {timeLoopState.daily_trend.map((d: any) => {
                      const maxErr = Math.max(15, d.nwp_rain_mae);
                      return (
                        <div
                          key={d.day}
                          className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80"
                        >
                          <div className="flex flex-wrap items-center justify-between text-xs mb-2">
                            <span className="font-bold text-slate-900">
                              Day {d.day} ({d.date}) ·{" "}
                              <code className="text-[#6D28D9]">
                                {d.model_version}
                              </code>
                            </span>
                            <span className="text-slate-600 font-medium">
                              Blended MAE:{" "}
                              <strong className="text-[#6D28D9]">
                                {d.blended_rain_mae} mm
                              </strong>{" "}
                              (NWP: {d.nwp_rain_mae} · AI: {d.ai_rain_mae} ·
                              Ens: {d.ensemble_rain_mae} mm)
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full bg-[#6D28D9] rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (d.blended_rain_mae / maxErr) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Version History & Activity Log (5 cols) */}
                <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-[#6D28D9] mb-3">
                      Model Version History
                    </h3>
                    <div className="space-y-2.5 max-h-[180px] overflow-y-auto">
                      {(timeLoopState.version_history || []).map(
                        (vh: any, i: number) => (
                          <div
                            key={`${vh.version}-${i}`}
                            className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">
                                {vh.version} (Day {vh.day})
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F5F3FF] text-[#6D28D9]">
                                {vh.status}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-1">
                              {vh.note}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-[#6D28D9] mb-3">
                      Learning-Cycle Activity Log
                    </h3>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto">
                      {(timeLoopState.activity_log || []).map(
                        (al: any, i: number) => (
                          <div
                            key={`${al.day}-${i}`}
                            className="p-3 rounded-xl border border-slate-100 bg-white text-xs text-slate-600"
                          >
                            <span className="font-bold text-[#6D28D9]">
                              Day {al.day} ({al.date}):{" "}
                            </span>
                            <span>{al.event}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
};
