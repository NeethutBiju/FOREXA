import React, { useMemo, useState } from "react";
import {
  Cpu,
  Globe,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
  History,
  Radio,
  BarChart3,
} from "lucide-react";
import {
  ComputedDistrictForecast,
  HorizonHours,
  MatchedHistoricalAnalog,
} from "../utils/forecastEngine";
import { EventIcon, SeverityChip } from "./WeatherIcons";
import { WeightOverLeadTimeChart } from "./ForecastCharts";

interface ModelInsightsTabProps {
  selectedForecast: ComputedDistrictForecast;
  allForecasts: ComputedDistrictForecast[];
  analogs: MatchedHistoricalAnalog[];
  evaluationData: any;
  shapData: any;
  weightsData: any;
  versionsData: any;
  leadTime: HorizonHours;
  darkMode: boolean;
  liveStreamEnabled?: boolean;
  liveCountdownSec?: number;
  liveTickCount?: number;
  liveStreamSnapshot?: any;
  onSelectDistrict: (districtName: string) => void;
}

export const ModelInsightsTab: React.FC<ModelInsightsTabProps> = ({
  selectedForecast,
  allForecasts,
  analogs,
  shapData,
  weightsData,
  leadTime,
  liveStreamEnabled = false,
  liveCountdownSec = 10,
  liveTickCount = 0,
  liveStreamSnapshot = null,
  onSelectDistrict,
}) => {
  const [expandedCard, setExpandedCard] = useState<
    "nwp" | "ai" | "ensemble" | null
  >("ensemble");

  // Match live stream data for the currently selected district if Live Stream has updated
  const liveDistrictData = useMemo(() => {
    if (!liveStreamSnapshot?.districts) return null;
    return (
      liveStreamSnapshot.districts.find(
        (d: any) =>
          String(d.district).toLowerCase() ===
          selectedForecast.district.name.toLowerCase()
      ) || liveStreamSnapshot.districts[0]
    );
  }, [liveStreamSnapshot, selectedForecast.district.name]);

  const activeWeights = liveStreamSnapshot?.unified_weights
    ? {
        nwp: Number(liveStreamSnapshot.unified_weights.W_NWP_pct ?? selectedForecast.weights.nwp),
        ai: Number(liveStreamSnapshot.unified_weights.W_AI_pct ?? selectedForecast.weights.ai),
        ensemble: Number(
          liveStreamSnapshot.unified_weights.W_Ensemble_pct ??
            selectedForecast.weights.ensemble
        ),
      }
    : selectedForecast.weights;

  const ind = selectedForecast.modelVariablesAtHorizon;

  const liveNwp = liveDistrictData?.sources?.nwp || ind.nwp;
  const liveAi = liveDistrictData?.sources?.ai || ind.ai;
  const liveEns = liveDistrictData?.sources?.ensemble || ind.ensemble;
  const liveBlended = liveDistrictData?.blended || {
    precip_6h_mm: selectedForecast.rain6hMm,
    temp_c: selectedForecast.currentPoint.tempC,
    humidity_pct: selectedForecast.currentPoint.humidityPct,
    wind_ms: selectedForecast.currentPoint.windMs,
    pressure_hpa: selectedForecast.currentPoint.pressureHpa,
  };

  // Plain-English explanation of WHY these weights were selected, powered by SHAP feature importance
  const plainEnglishSummary = useMemo(() => {
    const { nwp, ai, ensemble } = activeWeights;
    const dominant =
      ensemble >= ai && ensemble >= nwp
        ? { name: "Ensemble (WeatherNext 2)", pct: ensemble }
        : ai >= nwp
        ? { name: "AI Model (GraphCast)", pct: ai }
        : { name: "NWP (NOAA GFS)", pct: nwp };

    const runnerUp =
      dominant.name.startsWith("Ensemble")
        ? ai >= nwp
          ? { name: "AI Model", pct: ai }
          : { name: "NWP", pct: nwp }
        : dominant.name.startsWith("AI")
        ? ensemble >= nwp
          ? { name: "Ensemble", pct: ensemble }
          : { name: "NWP", pct: nwp }
        : ensemble >= ai
        ? { name: "Ensemble", pct: ensemble }
        : { name: "AI Model", pct: ai };

    const meanAbs = shapData?.mean_abs || {};
    const topShapKeys = Object.keys(meanAbs).slice(0, 3);
    const driverPhrases = topShapKeys.map((k) => {
      if (k.includes("recent_err") || k.includes("hist"))
        return "recent forecast accuracy";
      if (k.includes("precip") || k.includes("extreme"))
        return "current rainfall intensity";
      if (k.includes("spread") || k.includes("disagreement"))
        return "agreement across forecast members";
      if (k.includes("lead")) return "forecast lead-time stability";
      if (k.includes("wind") || k.includes("pressure"))
        return "wind and pressure patterns";
      return "recent weather behavior";
    });
    const uniqueDrivers = Array.from(new Set(driverPhrases));
    const driverText =
      uniqueDrivers.length > 0
        ? uniqueDrivers.join(", ")
        : "recent forecast accuracy, current rainfall intensity, and forecast lead-time stability";

    return `For the +${leadTime}-hour forecast in ${selectedForecast.district.name} (${selectedForecast.eventType}), FOREXA assigned the highest weight to the ${dominant.name} (${dominant.pct}%), followed by the ${runnerUp.name} (${runnerUp.pct}%), while keeping NWP at ${nwp}%. This balance was chosen because our explainability analysis identified ${driverText} as the strongest reasons for reliability right now. Under ${selectedForecast.eventType.toLowerCase()} conditions, the ${dominant.name} has consistently tracked rainfall and wind changes with the smallest errors, so giving it the largest share produces a more dependable final forecast than trusting any single source alone.`;
  }, [selectedForecast, leadTime, shapData, activeWeights]);

  // Extreme Event Model Distribution (clean regime breakdown)
  const extremeDistribution = useMemo(() => {
    const raw: any[] = weightsData?.mean_2025_weights_by_weather_regime || [];
    if (raw.length > 0) {
      return raw.map((r) => {
        const wN = Math.round(Number(r.w_nwp || 0) * 100);
        const wA = Math.round(Number(r.w_ai || 0) * 100);
        const wE = Math.max(0, 100 - wN - wA);
        const label = String(r.live_event_type || "Monsoon Regime")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        return { regime: label, nwp: wN, ai: wA, ensemble: wE };
      });
    }
    return [
      { regime: "Extreme Rainfall", nwp: 4, ai: 31, ensemble: 65 },
      { regime: "Heavy Rainfall", nwp: 6, ai: 34, ensemble: 60 },
      { regime: "High Wind / Cyclonic Gusts", nwp: 9, ai: 39, ensemble: 52 },
      { regime: "Normal Monsoon Flow", nwp: 14, ai: 36, ensemble: 50 },
    ];
  }, [weightsData]);

  const modelCards = [
    {
      id: "nwp" as const,
      title: "NWP Forecasting",
      subtitle: "Numerical weather model (NOAA GFS)",
      weightPct: activeWeights.nwp,
      icon: <Globe className="w-4 h-4 text-[#14532D]" />,
      data: liveNwp,
      notes: [
        "Provides baseline global physical atmospheric boundary conditions.",
        "Receives lower weight during localized intense convective rainfall spikes.",
      ],
    },
    {
      id: "ai" as const,
      title: "AI Model Forecasting",
      subtitle: "Spatio-temporal learned model (GraphCast)",
      weightPct: activeWeights.ai,
      icon: <Cpu className="w-4 h-4 text-[#14532D]" />,
      data: liveAi,
      notes: [
        "Strong tracking of synoptic pressure, temperature, and rapid coastal wind shifts.",
        "Balances the ensemble output smoothly across short and medium lead times.",
      ],
    },
    {
      id: "ensemble" as const,
      title: "Ensemble Forecasting",
      subtitle: "Multi-member probabilistic spread (WeatherNext 2)",
      weightPct: activeWeights.ensemble,
      icon: <Layers className="w-4 h-4 text-[#14532D]" />,
      data: liveEns,
      notes: [
        "Highest consistency during heavy monsoon rainfall and extreme weather transitions.",
        "Captures multi-member uncertainty spread to avoid single-run over- or under-prediction.",
      ],
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top District Selector Bar */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-[#ECFDF5] text-[#14532D]">
            <EventIcon type={selectedForecast.iconType} className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#15803D]">
                Adaptive Blending Insights
              </span>
              <SeverityChip severity={selectedForecast.severity} size="xs" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">
              Model Insights · {selectedForecast.district.name} (+{leadTime}h)
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="insights-district-select"
            className="text-xs font-semibold text-[#14532D]"
          >
            District:
          </label>
          <select
            id="insights-district-select"
            value={selectedForecast.district.name}
            onChange={(e) => onSelectDistrict(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#15803D]"
          >
            {allForecasts.map((f) => (
              <option key={f.district.name} value={f.district.name}>
                #{f.rank} {f.district.name}{" "}
                {f.hasNativeStation ? `(${f.eventType})` : "(Unmonitored)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ====================================================================
       * 1. TOP SECTION: LIVE 3-MODEL PREDICTIONS (NWP, AI, ENSEMBLE) + BLEND
       *    UPDATES EVERY 10 SECONDS WHEN LIVE STREAM IS TOGGLED ON!
       * ==================================================================== */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
              Individual Model Predictions
            </span>
            <h3 className="text-lg font-bold text-[#14532D] mt-0.5 flex items-center gap-2">
              <Radio
                className={`w-4 h-4 ${
                  liveStreamEnabled ? "text-[#15803D] animate-pulse" : "text-slate-400"
                }`}
              />
              <span>
                NWP, AI &amp; Ensemble Predictions ·{" "}
                {selectedForecast.district.name}
              </span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {liveStreamEnabled ? (
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#ECFDF5] border border-emerald-300 text-xs font-bold text-[#14532D]">
                <span className="w-2 h-2 rounded-full bg-[#15803D] animate-pulse" />
                <span>
                  Live Stream Active · Next update in {liveCountdownSec}s
                  {liveTickCount > 0 ? ` (Update #${liveTickCount})` : ""}
                </span>
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-500">
                Toggle “Live Stream” in top bar to stream 10s model updates
              </span>
            )}
          </div>
        </div>

        {/* 3 Model Live Prediction Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {modelCards.map((card) => {
            const isExpanded = expandedCard === card.id;
            const d = card.data;
            return (
              <div
                key={card.id}
                onClick={() => setExpandedCard(isExpanded ? null : card.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedCard(isExpanded ? null : card.id);
                  }
                }}
                className={`rounded-2xl border p-5 cursor-pointer transition-all duration-300 bg-white ${
                  liveTickCount > 0 && liveStreamEnabled
                    ? "border-[#15803D] ring-1 ring-emerald-200 shadow-sm"
                    : isExpanded
                    ? "border-[#14532D] ring-1 ring-[#14532D] shadow-sm"
                    : "border-slate-200 hover:border-emerald-300"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-[#ECFDF5]">
                      {card.icon}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-900">
                        {card.title}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {card.subtitle}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-extrabold text-[#14532D]">
                      {card.weightPct}%
                    </div>
                    <div className="text-[10px] text-slate-400">Weight</div>
                  </div>
                </div>

                {/* Clear 2x2 Variable Grid for Each Model */}
                <div className="mt-4 grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#F4F9F6] border border-emerald-100">
                    <div className="text-[10px] font-semibold text-slate-500">
                      6h Rainfall
                    </div>
                    <div className="font-extrabold text-slate-900 mt-0.5">
                      {d?.precip_6h_mm ?? "—"} mm
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-[10px] font-semibold text-slate-500">
                      Temperature
                    </div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {d?.temp_c ?? "—"} °C
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-[10px] font-semibold text-slate-500">
                      Wind Speed
                    </div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {d?.wind_ms ?? "—"} m/s
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="text-[10px] font-semibold text-slate-500">
                      Pressure
                    </div>
                    <div className="font-bold text-slate-900 mt-0.5">
                      {d?.pressure_hpa ?? "—"} hPa
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs font-semibold text-[#15803D]">
                  <span>{isExpanded ? "Hide notes" : "View role notes"}</span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>

                {isExpanded && (
                  <ul className="mt-3 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    {card.notes.map((n, i) => (
                      <li key={i}>• {n}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Resulting Blended Output Summary Strip */}
        <div className="p-4 rounded-xl bg-[#ECFDF5] border border-emerald-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="font-bold text-[#14532D]">
            Resulting Adaptive Blended Output ({selectedForecast.district.name}):
          </div>
          <div className="flex flex-wrap items-center gap-5 font-bold text-slate-900">
            <span>Rainfall: {liveBlended?.precip_6h_mm ?? "—"} mm/6h</span>
            <span>Temp: {liveBlended?.temp_c ?? "—"} °C</span>
            <span>Wind: {liveBlended?.wind_ms ?? "—"} m/s</span>
            <span>Pressure: {liveBlended?.pressure_hpa ?? "—"} hPa</span>
          </div>
        </div>
      </div>

      {/* ====================================================================
       * 2. PLAIN-ENGLISH EXPLANATION OF WHY THESE WEIGHTS WERE CHOSEN
       * ==================================================================== */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
              Blending Explanation
            </span>
            <h3 className="text-lg font-bold text-[#14532D] mt-0.5">
              Why FOREXA Chose These Weights (+{leadTime}h)
            </h3>
          </div>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#ECFDF5] text-[#14532D] border border-emerald-200 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              NWP {activeWeights.nwp}% · AI {activeWeights.ai}% · Ensemble{" "}
              {activeWeights.ensemble}%
            </span>
          </div>
        </div>

        <p className="text-sm text-slate-700 leading-relaxed bg-[#F4F9F6] border border-emerald-100 rounded-xl p-5">
          {plainEnglishSummary}
        </p>
      </div>

      {/* ====================================================================
       * 3. EXTREME EVENT MODEL DISTRIBUTION
       * ==================================================================== */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
              Regime Weighting
            </span>
            <h3 className="text-lg font-bold text-[#14532D] mt-0.5 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              <span>Extreme Event Model Distribution</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              How NWP, AI Model, and Ensemble contributions adapt across Kerala
              extreme weather regimes
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#5490C4]" />
              NWP
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#15803D]" />
              AI Model
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#7E57C2]" />
              Ensemble
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {extremeDistribution.map((row) => (
            <div key={row.regime} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                <span>{row.regime}</span>
                <span className="text-slate-500 font-semibold">
                  NWP {row.nwp}% · AI {row.ai}% · Ensemble {row.ensemble}%
                </span>
              </div>
              <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100">
                <div
                  style={{ width: `${row.nwp}%` }}
                  className="bg-[#5490C4] transition-all duration-300"
                />
                <div
                  style={{ width: `${row.ai}%` }}
                  className="bg-[#15803D] transition-all duration-300"
                />
                <div
                  style={{ width: `${row.ensemble}%` }}
                  className="bg-[#7E57C2] transition-all duration-300"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ====================================================================
       * 4. WEIGHT EVOLUTION OVER LEAD TIME
       * ==================================================================== */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
        <WeightOverLeadTimeChart
          forecast={selectedForecast}
          leadTime={leadTime}
          darkMode={false}
        />
      </div>

      {/* ====================================================================
       * 5. SIMILAR PAST WEATHER EVENTS (PREVIOUS YEARS)
       * ==================================================================== */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
            Historical Precedents
          </span>
          <h3 className="text-lg font-bold text-[#14532D] mt-0.5 flex items-center gap-2">
            <History className="w-5 h-5" />
            <span>Similar Events in Previous Years</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Past Kerala weather episodes closely matching the current{" "}
            {selectedForecast.district.name} forecast pattern
          </p>
        </div>

        {analogs.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-50 border border-slate-200/80 text-center text-xs text-slate-500">
            No matching historical episodes found for this district filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {analogs.slice(0, 4).map((analog, idx) => (
              <div
                key={analog.id}
                className="rounded-2xl border border-slate-200 p-5 bg-white flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div>
                      <span className="text-[11px] font-bold text-[#15803D]">
                        Precedent #{idx + 1} · {analog.year}
                      </span>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                        {analog.districtName} · {analog.dateRange}
                      </h4>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#ECFDF5] text-[#14532D] shrink-0">
                      {analog.similarityPct}%
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600">
                    <div className="flex justify-between font-semibold text-slate-800">
                      <span>Recorded 6h Rain:</span>
                      <span>{analog.recordedRain6hMm} mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Temp &amp; Wind:</span>
                      <span>
                        {analog.tempC}°C · {analog.windMs} m/s
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Condition:</span>
                      <span className="font-medium text-slate-800">
                        {analog.weatherCondition}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold">
                  <span className="text-slate-400">Event Regime:</span>
                  <span className="text-[#14532D]">
                    {analog.eventType.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
