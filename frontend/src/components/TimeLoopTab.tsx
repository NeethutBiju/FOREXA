import React, { useEffect, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Calendar,
  TrendingUp,
  Award,
  CheckCircle2,
} from "lucide-react";
import {
  fetchTimeLoopStateApi,
  resetTimeLoopApi,
  stepTimeLoopApi,
} from "../utils/forecastEngine";
import { trackAnalyticsEvent, UserSession } from "../firebase";

interface TimeLoopTabProps {
  session: UserSession | null;
}

export const TimeLoopTab: React.FC<TimeLoopTabProps> = ({ session }) => {
  const [tlState, setTlState] = useState<any>(null);
  const [startDate, setStartDate] = useState<string>("2026-06-01");
  const [autoRunning, setAutoRunning] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const loadState = async () => {
    const data = await fetchTimeLoopStateApi(session?.idToken);
    setTlState(data);
  };

  useEffect(() => {
    loadState();
  }, [session?.idToken]);

  useEffect(() => {
    if (!autoRunning) return;
    const timer = setInterval(async () => {
      const next = await stepTimeLoopApi(1, session?.idToken);
      setTlState(next);
    }, 2800);
    return () => clearInterval(timer);
  }, [autoRunning, session?.idToken]);

  const handleAdvanceDays = async (days: number) => {
    setLoading(true);
    try {
      const next = await stepTimeLoopApi(days, session?.idToken);
      setTlState(next);
      trackAnalyticsEvent("timeloop_advance_days", {
        days,
        completed_cycles: next?.completed_cycles,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setAutoRunning(false);
    setLoading(true);
    try {
      const next = await resetTimeLoopApi(startDate, session?.idToken);
      setTlState(next);
    } finally {
      setLoading(false);
    }
  };

  // Extract live weights for the Donut Chart (Reference Image 2)
  const weights = tlState?.next_day_forecast_preview?.weights || {
    W_NWP_pct: 22,
    W_AI_pct: 36,
    W_Ensemble_pct: 42,
  };
  const wNwp = Math.max(0, Number(weights.W_NWP_pct ?? 22));
  const wAi = Math.max(0, Number(weights.W_AI_pct ?? 36));
  const wEns = Math.max(0, Number(weights.W_Ensemble_pct ?? 42));

  // Compute source skill % from recent TimeLoop MAE (for Reference Image 2 "Skill by forecast source")
  const trend: any[] = tlState?.daily_trend || [];
  const latestDay = trend.length > 0 ? trend[trend.length - 1] : null;
  const nwpSkill = latestDay
    ? Math.max(55, Math.min(98, Math.round(100 - latestDay.nwp_rain_mae * 1.4)))
    : 84;
  const aiSkill = latestDay
    ? Math.max(60, Math.min(99, Math.round(100 - latestDay.ai_rain_mae * 1.6)))
    : 92;
  const ensSkill = latestDay
    ? Math.max(
        65,
        Math.min(99, Math.round(100 - latestDay.ensemble_rain_mae * 1.5))
      )
    : 95;

  // SVG Donut math
  const r = 62;
  const circ = 2 * Math.PI * r;
  const nwpLen = (wNwp / 100) * circ;
  const aiLen = (wAi / 100) * circ;
  const ensLen = (wEns / 100) * circ;

  const yesterdayDistricts: any[] =
    tlState?.yesterday_comparison?.districts || [];
  const versionHistory: any[] = tlState?.version_history || [];

  return (
    <div className="space-y-8">
      {/* TOP CONTROL BAR */}
      <section className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
            Continuous Learning Simulator
          </span>
          <h2 className="text-xl font-bold text-[#14532D] mt-0.5">
            FOREXA TimeLoop — Day-by-Day Model Learning
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Simulated Date:{" "}
            <strong className="text-slate-900">
              {tlState?.current_simulated_date || startDate}
            </strong>{" "}
            · Completed Cycles:{" "}
            <strong className="text-[#14532D]">
              {tlState?.completed_cycles ?? 0} days
            </strong>{" "}
            · Active Model:{" "}
            <strong className="text-slate-900">
              {tlState?.current_model_version || "Adaptive XGBoost"}
            </strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#14532D]" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setAutoRunning(!autoRunning)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#14532D] hover:bg-[#052E16] text-white text-xs font-bold shadow-sm transition"
          >
            {autoRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause Loop</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Start Auto-Loop</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleAdvanceDays(1)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-emerald-200 bg-[#ECFDF5] hover:bg-emerald-100 text-[#14532D] text-xs font-bold transition"
          >
            <FastForward className="w-3.5 h-3.5" />
            <span>+1 Day</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleAdvanceDays(3)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition"
          >
            <span>+3 Days</span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </section>

      {/* ====================================================================
       * TWO REFERENCE CARDS MATCHING REFERENCE IMAGE 2
       * 1. CURRENT DISTRIBUTION — Model contribution (Donut Chart)
       * 2. RECENT PERFORMANCE — Skill by forecast source (Progress Bars)
       * ==================================================================== */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: CURRENT DISTRIBUTION — Model contribution */}
        <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#15803D]">
                CURRENT DISTRIBUTION
              </span>
              <h3 className="text-lg font-bold text-[#14532D] mt-0.5">
                Model contribution
              </h3>
            </div>
            <span className="px-3 py-1 rounded-lg bg-[#ECFDF5] border border-emerald-200 text-xs font-bold text-[#14532D]">
              Blended Forecast
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-between gap-8 px-2">
            {/* SVG Donut Chart */}
            <div className="relative w-44 h-44 shrink-0">
              <svg viewBox="0 0 180 180" className="w-full h-full -rotate-90">
                {/* Ensemble Arc */}
                <circle
                  cx="90"
                  cy="90"
                  r={r}
                  fill="none"
                  stroke="#7E57C2"
                  strokeWidth="26"
                  strokeDasharray={`${ensLen} ${circ}`}
                  strokeDashoffset={0}
                />
                {/* AI Model Arc */}
                <circle
                  cx="90"
                  cy="90"
                  r={r}
                  fill="none"
                  stroke="#15803D"
                  strokeWidth="26"
                  strokeDasharray={`${aiLen} ${circ}`}
                  strokeDashoffset={-ensLen}
                />
                {/* NWP Arc */}
                <circle
                  cx="90"
                  cy="90"
                  r={r}
                  fill="none"
                  stroke="#3B82B6"
                  strokeWidth="26"
                  strokeDasharray={`${nwpLen} ${circ}`}
                  strokeDashoffset={-(ensLen + aiLen)}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-extrabold text-[#14532D]">
                  100%
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  total weight
                </span>
              </div>
            </div>

            {/* Right Legend */}
            <div className="flex-1 min-w-[180px] space-y-4">
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 text-sm">
                <span className="inline-flex items-center gap-2.5 font-medium text-slate-700">
                  <span className="w-3 h-3 rounded-sm bg-[#3B82B6]" />
                  <span>NWP</span>
                </span>
                <span className="font-bold text-slate-900">
                  {wNwp.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 text-sm">
                <span className="inline-flex items-center gap-2.5 font-medium text-slate-700">
                  <span className="w-3 h-3 rounded-sm bg-[#15803D]" />
                  <span>AI model</span>
                </span>
                <span className="font-bold text-slate-900">
                  {wAi.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2.5 font-medium text-slate-700">
                  <span className="w-3 h-3 rounded-sm bg-[#7E57C2]" />
                  <span>Ensemble</span>
                </span>
                <span className="font-bold text-slate-900">
                  {wEns.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: RECENT PERFORMANCE — Skill by forecast source */}
        <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm flex flex-col justify-between space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#15803D]">
                RECENT PERFORMANCE
              </span>
              <h3 className="text-lg font-bold text-[#14532D] mt-0.5">
                Skill by forecast source
              </h3>
            </div>
            <span className="px-3 py-1 rounded-lg bg-[#ECFDF5] border border-emerald-200 text-xs font-bold text-[#14532D]">
              {trend.length > 0 ? `Last ${trend.length} cycles` : "Last 14 days"}
            </span>
          </div>

          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1.5">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#3B82B6]" />
                  <span>NWP</span>
                </span>
                <span>{nwpSkill}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#3B82B6] transition-all duration-500"
                  style={{ width: `${nwpSkill}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1.5">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#15803D]" />
                  <span>AI model</span>
                </span>
                <span>{aiSkill}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#15803D] transition-all duration-500"
                  style={{ width: `${aiSkill}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-1.5">
                <span className="inline-flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm bg-[#7E57C2]" />
                  <span>Ensemble</span>
                </span>
                <span>{ensSkill}%</span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#7E57C2] transition-all duration-500"
                  style={{ width: `${ensSkill}%` }}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 pt-2">
            Higher skill produces a larger contribution when the current weather
            regime matches.
          </p>
        </div>
      </section>

      {/* ====================================================================
       * PREVIOUS FORECAST VS NEXT-DAY SIMULATED ACTUAL COMPARISON
       * ==================================================================== */}
      <section className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#15803D]">
              FORECAST VERIFICATION CYCLE
            </span>
            <h3 className="text-base font-bold text-[#14532D] mt-0.5 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <span>
                Previous Forecast vs Next-Day Simulated Actual Outcome
              </span>
            </h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {tlState?.yesterday_comparison?.valid_date
              ? `Verified Date: ${tlState.yesterday_comparison.valid_date}`
              : "Click +1 Day to verify next-day outcomes"}
          </span>
        </div>

        {tlState?.performance_summary && (
          <div className="p-4 rounded-xl bg-[#F4F9F6] border border-emerald-200 text-xs text-slate-700 leading-relaxed font-medium">
            {tlState.performance_summary}
          </div>
        )}

        {yesterdayDistricts.length === 0 ? (
          <div className="p-8 rounded-xl bg-slate-50 border border-slate-200/80 text-center text-xs text-slate-500">
            Click <strong className="text-[#14532D]">+1 Day</strong> or{" "}
            <strong className="text-[#14532D]">Start Auto-Loop</strong> above to
            compare the current forecast against the next day&apos;s simulated
            actual outcome and watch model weights update automatically.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/70">
                  <th className="py-3 px-4">District</th>
                  <th className="py-3 px-3">Prev NWP (mm)</th>
                  <th className="py-3 px-3">Prev AI (mm)</th>
                  <th className="py-3 px-3">Prev Ensemble (mm)</th>
                  <th className="py-3 px-3">Prev Blended (mm)</th>
                  <th className="py-3 px-3">Next-Day Actual (mm)</th>
                  <th className="py-3 px-4 text-right">Blended Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yesterdayDistricts.map((row: any) => (
                  <tr key={row.district} className="hover:bg-[#F4F9F6]/60">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {row.district}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {row.nwp_rain_mm}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {row.ai_rain_mm}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {row.ensemble_rain_mm}
                    </td>
                    <td className="py-3 px-3 font-bold text-[#14532D]">
                      {row.blended_rain_mm}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      {row.observed_rain_mm}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-[#15803D]">
                      ±{row.blended_abs_error_mm} mm
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ====================================================================
       * WEIGHT UPDATE & MODEL PERFORMANCE HISTORY
       * ==================================================================== */}
      <section className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#15803D]">
              WEIGHT UPDATE HISTORY
            </span>
            <h3 className="text-base font-bold text-[#14532D] mt-0.5 flex items-center gap-2">
              <Award className="w-4 h-4" />
              <span>Model Performance &amp; Promotion History</span>
            </h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {trend.length} simulated days logged
          </span>
        </div>

        {trend.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-slate-50/70">
                  <th className="py-2.5 px-3">Day</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Weights (NWP / AI / Ens)</th>
                  <th className="py-2.5 px-3">NWP MAE</th>
                  <th className="py-2.5 px-3">AI MAE</th>
                  <th className="py-2.5 px-3">Ensemble MAE</th>
                  <th className="py-2.5 px-3">FOREXA Blended MAE</th>
                  <th className="py-2.5 px-3 text-right">Active Model</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...trend].reverse().map((day: any) => (
                  <tr key={day.day} className="hover:bg-[#F4F9F6]/60">
                    <td className="py-2.5 px-3 font-bold text-[#14532D]">
                      Day {day.day}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{day.date}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      {day.W_NWP_pct}% / {day.W_AI_pct}% / {day.W_Ensemble_pct}%
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {day.nwp_rain_mae} mm
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {day.ai_rain_mae} mm
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {day.ensemble_rain_mae} mm
                    </td>
                    <td className="py-2.5 px-3 font-extrabold text-[#15803D]">
                      {day.blended_rain_mae} mm
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[11px] text-slate-500">
                      {day.model_version}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {versionHistory.length > 0 && (
          <div className="pt-3 border-t border-slate-100 space-y-2">
            {versionHistory.slice(0, 5).map((v: any, idx: number) => (
              <div
                key={idx}
                className="p-3 rounded-xl bg-[#F4F9F6] border border-emerald-100 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D] shrink-0" />
                  <span className="font-bold text-slate-900">{v.version}</span>
                  <span className="text-slate-600">· {v.note}</span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white border border-emerald-200 text-[#14532D]">
                  {v.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
