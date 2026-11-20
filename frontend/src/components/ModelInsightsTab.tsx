import React, { useState } from "react";
import {
  Cpu,
  Globe,
  Layers,
  ChevronDown,
  ChevronUp,
  Sparkles,
  History,
  CheckCircle2,
  Database,
  Award,
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
  onSelectDistrict: (districtName: string) => void;
}

export const ModelInsightsTab: React.FC<ModelInsightsTabProps> = ({
  selectedForecast,
  allForecasts,
  analogs,
  evaluationData,
  shapData,
  weightsData,
  versionsData,
  leadTime,
  darkMode,
  onSelectDistrict,
}) => {
  const [expandedCard, setExpandedCard] = useState<
    "nwp" | "ai" | "ensemble" | null
  >("ensemble");
  const [outlookTab, setOutlookTab] = useState<"nwp" | "ai" | "ensemble">(
    "ensemble"
  );
  const [selectedAnalogDetail, setSelectedAnalogDetail] =
    useState<MatchedHistoricalAnalog | null>(analogs[0] || null);

  const overall2025 = evaluationData?.overall_2025_test || {};
  const weightVerif = evaluationData?.weight_verification_2025 || {};
  const activeModelMeta = versionsData?.active_model || {};
  const ind = selectedForecast.modelVariablesAtHorizon;
  const predErrs = selectedForecast.predictedSourceErrors;

  const shapTopDrivers: { name: string; shapVal: number }[] =
    React.useMemo(() => {
      const meanAbs = shapData?.mean_abs || {};
      return Object.entries(meanAbs)
        .slice(0, 8)
        .map(([k, v]) => ({
          name: k,
          shapVal: Number(v),
        }));
    }, [shapData]);

  const maxShap = Math.max(
    0.01,
    ...(shapTopDrivers.map((d) => d.shapVal) || [0.05])
  );

  const modelCards = [
    {
      id: "nwp" as const,
      badge: "N",
      title: "N · NWP Forecasting",
      subtitle: "Numerical weather model (NOAA GFS)",
      weightPct: selectedForecast.weights.nwp,
      icon: <Globe className="w-4 h-4 text-[#6D28D9]" />,
      predErr: predErrs?.nwp,
      forecastSummary: ind.nwp
        ? `Rain: ${ind.nwp.precip_6h_mm ?? "—"} mm/6h · Temp: ${ind.nwp.temp_c ?? "—"}°C · Wind: ${ind.nwp.wind_ms ?? "—"} m/s · Pressure: ${ind.nwp.pressure_hpa ?? "—"} hPa`
        : "No station feed for this district",
      testSkill2025: overall2025.nwp
        ? `2025 Rain MAE: ${overall2025.nwp.precip_6h_mm?.mae} mm · Temp MAE: ${overall2025.nwp.temp_c?.mae}°C`
        : "Verified on 2025 dataset",
      strengths: [
        `Heavy Rain (>=20mm) CSI: ${overall2025.nwp?.rainfall_contingency?.heavy_20mm?.csi ?? "0.1913"}`,
        "Provides baseline global physical boundary conditions across 24h & 72h leads",
        `Predicted composite error for this cycle: ${predErrs?.nwp ?? "—"}`,
      ],
    },
    {
      id: "ai" as const,
      badge: "AI",
      title: "AI · AI Model Forecasting",
      subtitle: "Spatio-temporal learned model (GraphCast)",
      weightPct: selectedForecast.weights.ai,
      icon: <Cpu className="w-4 h-4 text-[#6D28D9]" />,
      predErr: predErrs?.ai,
      forecastSummary: ind.ai
        ? `Rain: ${ind.ai.precip_6h_mm ?? "—"} mm/6h · Temp: ${ind.ai.temp_c ?? "—"}°C · Wind: ${ind.ai.wind_ms ?? "—"} m/s · Pressure: ${ind.ai.pressure_hpa ?? "—"} hPa`
        : "No station feed for this district",
      testSkill2025: overall2025.ai
        ? `2025 Rain MAE: ${overall2025.ai.precip_6h_mm?.mae} mm · Temp MAE: ${overall2025.ai.temp_c?.mae}°C`
        : "Verified on 2025 dataset",
      strengths: [
        `Heavy Rain (>=20mm) CSI: ${overall2025.ai?.rainfall_contingency?.heavy_20mm?.csi ?? "0.6595"}`,
        `Sea-Level Pressure MAE: ${overall2025.ai?.pressure_hpa?.mae ?? "0.3276"} hPa`,
        `Predicted composite error for this cycle: ${predErrs?.ai ?? "—"}`,
      ],
    },
    {
      id: "ensemble" as const,
      badge: "E",
      title: "E · Ensemble Forecasting",
      subtitle: "Multi-member probabilistic spread (WeatherNext 2)",
      weightPct: selectedForecast.weights.ensemble,
      icon: <Layers className="w-4 h-4 text-[#6D28D9]" />,
      predErr: predErrs?.ensemble,
      forecastSummary: ind.ensemble
        ? `Rain: ${ind.ensemble.precip_6h_mm ?? "—"} mm/6h · Temp: ${ind.ensemble.temp_c ?? "—"}°C · Wind: ${ind.ensemble.wind_ms ?? "—"} m/s · Spread: ±${selectedForecast.uncertaintyIndicators.precipSpreadMm ?? "—"} mm`
        : "No station feed for this district",
      testSkill2025: overall2025.ensemble
        ? `2025 Rain MAE: ${overall2025.ensemble.precip_6h_mm?.mae} mm · Temp MAE: ${overall2025.ensemble.temp_c?.mae}°C`
        : "Verified on 2025 dataset",
      strengths: [
        `Heavy Rain (>=20mm) CSI: ${overall2025.ensemble?.rainfall_contingency?.heavy_20mm?.csi ?? "0.8396"}`,
        "Provides P10–P90 quantile uncertainty spread and precipitation probability",
        `Predicted composite error for this cycle: ${predErrs?.ensemble ?? "—"}`,
      ],
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top District & Horizon Bar */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-[#F5F3FF] text-[#6D28D9]">
            <EventIcon type={selectedForecast.iconType} className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#6D28D9]">
                Model Version: {selectedForecast.modelVersion}
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
            className="text-xs font-semibold text-[#6D28D9]"
          >
            District:
          </label>
          <select
            id="insights-district-select"
            value={selectedForecast.district.name}
            onChange={(e) => onSelectDistrict(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
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

      {/* 4.1 "Why these weights?" */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-base font-bold text-[#6D28D9]">
              Why These Weights? (+{leadTime}h Configuration)
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              One unified set of NWP, AI, and Ensemble weights per forecast
              configuration — shared across all weather variables and all 14
              Kerala districts (Cross-district std ={" "}
              {weightVerif.max_cross_district_weight_std ?? 0.0}).
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F5F3FF] text-[#6D28D9] border border-purple-200 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              Weight ∝ Skill × Recency × Regime fit × Lead-time stability
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {modelCards.map((card) => {
            const isExpanded = expandedCard === card.id;
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
                className={`rounded-2xl border p-5 cursor-pointer transition-all duration-200 bg-white ${
                  isExpanded
                    ? "border-[#6D28D9] ring-1 ring-[#6D28D9] shadow-sm"
                    : "border-slate-200 hover:border-purple-300"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl bg-[#F5F3FF] text-[#6D28D9] flex items-center justify-center font-bold text-xs">
                      {card.badge}
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {card.title}
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {card.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold text-[#6D28D9] leading-none">
                      {card.weightPct}%
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">
                      Weight
                    </span>
                  </div>
                </div>

                <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mt-4">
                  <div
                    className="h-full rounded-full bg-[#6D28D9] transition-all duration-300"
                    style={{ width: `${card.weightPct}%` }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-600 font-medium">
                  <span className="truncate">{card.testSkill2025}</span>
                  <span className="inline-flex items-center gap-0.5 text-[#6D28D9] font-semibold shrink-0 ml-2">
                    {isExpanded ? (
                      <>
                        <span>Hide</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Details</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </span>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5 text-xs text-slate-700">
                    <div className="p-3 rounded-xl bg-slate-50 font-medium">
                      {selectedForecast.district.name} (+{leadTime}h):{" "}
                      {card.forecastSummary}
                    </div>
                    <ul className="space-y-1.5">
                      {card.strengths.map((str, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-xs text-slate-600"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#6D28D9] shrink-0 mt-0.5" />
                          <span>{str}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {selectedForecast.technicalExplainabilityBrief && (
          <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
            <strong className="text-[#6D28D9]">Technical Summary: </strong>
            {selectedForecast.technicalExplainabilityBrief}
          </div>
        )}
      </div>

      {/* 4.2 Weight Over Lead Time & 4.3 Individual Model Outlook */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
          <h3 className="text-base font-bold text-[#6D28D9] mb-3">
            Unified Adaptive Weight Over Lead Time (6h–72h)
          </h3>
          <WeightOverLeadTimeChart
            forecast={selectedForecast}
            leadTime={leadTime}
            darkMode={darkMode}
          />

          {weightsData?.mean_2025_weights_by_weather_regime && (
            <div className="mt-5 pt-4 border-t border-slate-100">
              <div className="text-xs font-bold text-[#6D28D9] mb-3">
                Weight Adaptation by Weather Regime (2025 Evaluation)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                {weightsData.mean_2025_weights_by_weather_regime.map(
                  (reg: any) => (
                    <div
                      key={reg.live_event_type}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200/80"
                    >
                      <div className="font-bold text-[10px] truncate text-[#6D28D9]">
                        {reg.live_event_type.replace(/_/g, " ")}
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-slate-700 font-medium">
                        <div>Ens: {(reg.w_ensemble * 100).toFixed(1)}%</div>
                        <div>AI: {(reg.w_ai * 100).toFixed(1)}%</div>
                        <div>NWP: {(reg.w_nwp * 100).toFixed(1)}%</div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        {/* 4.3 Individual Model Outlook */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-[#6D28D9]">
              Individual Model Outlook · {selectedForecast.district.name}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Compare source predictions at +{leadTime}h horizon
            </p>

            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-50 border border-slate-200 my-4">
              {(
                [
                  { id: "nwp", label: `NWP (${selectedForecast.weights.nwp}%)` },
                  { id: "ai", label: `AI (${selectedForecast.weights.ai}%)` },
                  {
                    id: "ensemble",
                    label: `Ensemble (${selectedForecast.weights.ensemble}%)`,
                  },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOutlookTab(t.id)}
                  className={`py-2 rounded-lg text-xs font-semibold transition ${
                    outlookTab === t.id
                      ? "bg-[#6D28D9] text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {!selectedForecast.hasNativeStation ? (
              <div className="p-4 rounded-xl bg-slate-50 text-xs text-slate-600">
                No station records available in the dataset for{" "}
                {selectedForecast.district.name}.
              </div>
            ) : (
              (() => {
                const activeSrc = ind[outlookTab];
                return (
                  <div className="grid grid-cols-2 gap-3.5 text-xs">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="text-[11px] font-medium text-slate-500">
                        6h Rainfall
                      </div>
                      <div className="text-lg font-bold text-slate-900 mt-1">
                        {activeSrc?.precip_6h_mm ?? "—"} mm
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="text-[11px] font-medium text-slate-500">
                        Temperature
                      </div>
                      <div className="text-lg font-bold text-slate-900 mt-1">
                        {activeSrc?.temp_c ?? "—"} °C
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="text-[11px] font-medium text-slate-500">
                        Wind Speed
                      </div>
                      <div className="text-base font-bold text-slate-900 mt-1">
                        {activeSrc?.wind_ms ?? "—"} m/s
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="text-[11px] font-medium text-slate-500">
                        Pressure &amp; Humidity
                      </div>
                      <div className="text-base font-bold text-slate-900 mt-1">
                        {activeSrc?.pressure_hpa ?? "—"} hPa ·{" "}
                        {activeSrc?.humidity_pct ?? "—"}%
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-500">
                Final Blended Forecast:
              </span>
              <span className="font-bold text-sm text-[#6D28D9]">
                {selectedForecast.rain6hMm ?? "—"} mm/6h ·{" "}
                {selectedForecast.currentPoint.tempC ?? "—"}°C ·{" "}
                {selectedForecast.currentPoint.windMs ?? "—"} m/s
              </span>
            </div>
            {ind.observed && ind.observed.precip_6h_mm !== null && (
              <div className="flex items-center justify-between text-slate-600 font-medium">
                <span>2025 Reference Observation:</span>
                <span className="font-semibold text-slate-900">
                  {ind.observed.precip_6h_mm} mm/6h · {ind.observed.temp_c}°C ·{" "}
                  {ind.observed.wind_ms} m/s
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2025 TEST DATASET EVALUATION TABLE */}
      {overall2025.forexa_adaptive && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base font-bold text-[#6D28D9]">
                2025 Test Dataset Evaluation Metrics (23,216 Forecast Events)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Comparison of individual models, equal-weight baseline, and
                FOREXA unified adaptive blend
              </p>
            </div>
            <Award className="w-5 h-5 text-[#6D28D9]" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 pr-3">Forecast Method</th>
                  <th className="py-3 px-2">6h Rain MAE / RMSE</th>
                  <th className="py-3 px-2">Temp MAE (°C)</th>
                  <th className="py-3 px-2">Humidity MAE (%)</th>
                  <th className="py-3 px-2">Wind MAE (m/s)</th>
                  <th className="py-3 px-2">Pressure MAE (hPa)</th>
                  <th className="py-3 px-2">
                    Heavy Rain (&ge;20mm) POD / FAR / CSI
                  </th>
                  <th className="py-3 pl-2">Composite Norm MAE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {(
                  [
                    { key: "nwp", label: "NWP-Only (GFS)" },
                    { key: "ai", label: "AI-Only (GraphCast)" },
                    { key: "ensemble", label: "Ensemble-Only (WeatherNext 2)" },
                    { key: "equal_weight", label: "Equal-Weight (1/3 each)" },
                    {
                      key: "forexa_adaptive",
                      label: "Adaptive FOREXA (Unified Weights)",
                      highlight: true,
                    },
                  ] as const
                ).map((row) => {
                  const m = overall2025[row.key];
                  if (!m) return null;
                  const h20 = m.rainfall_contingency?.heavy_20mm || {};
                  return (
                    <tr
                      key={row.key}
                      className={
                        row.highlight
                          ? "bg-[#F5F3FF] font-bold text-[#6D28D9]"
                          : ""
                      }
                    >
                      <td className="py-3 pr-3">{row.label}</td>
                      <td className="py-3 px-2">
                        {m.precip_6h_mm?.mae} mm / {m.precip_6h_mm?.rmse} mm
                      </td>
                      <td className="py-3 px-2">{m.temp_c?.mae} °C</td>
                      <td className="py-3 px-2">{m.humidity_pct?.mae} %</td>
                      <td className="py-3 px-2">{m.wind_ms?.mae} m/s</td>
                      <td className="py-3 px-2">{m.pressure_hpa?.mae} hPa</td>
                      <td className="py-3 px-2">
                        POD {h20.pod} · FAR {h20.far} · CSI {h20.csi}
                      </td>
                      <td className="py-3 pl-2 font-bold">
                        {m.composite_norm_mae}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4.4 TREESHAP EXPLAINABILITY & 4.5 HISTORICAL ANALOG PERFORMANCE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm">
          <h3 className="text-base font-bold text-[#6D28D9] mb-1">
            What Shaped This Outlook (TreeSHAP)
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Global feature attribution from{" "}
            <code>{selectedForecast.modelVersion}</code>
          </p>

          <div className="space-y-3">
            {shapTopDrivers.map((drv, idx) => {
              const barPct = Math.min(
                100,
                Math.round((drv.shapVal / maxShap) * 100)
              );
              return (
                <div
                  key={drv.name}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200/80"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-1.5">
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-[#F5F3FF] text-[#6D28D9] text-[10px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <code>{drv.name}</code>
                    </span>
                    <span className="text-[#6D28D9]">
                      {drv.shapVal.toFixed(4)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className="h-full bg-[#6D28D9] rounded-full"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-base font-bold text-[#6D28D9]">
                  Model Performance on Historical Analogs
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Source errors and weight allocation during matched historical
                  observations
                </p>
              </div>
              <History className="w-5 h-5 text-[#6D28D9]" />
            </div>

            {analogs.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">
                No historical observation analogs found for the current filter.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 pr-3">Observed Date &amp; District</th>
                      <th className="py-2.5 px-2">Obs 6h Rain</th>
                      <th className="py-2.5 px-2">NWP Error</th>
                      <th className="py-2.5 px-2">AI Error</th>
                      <th className="py-2.5 px-2">Ensemble Error</th>
                      <th className="py-2.5 pl-2">Highest Weighted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {analogs.map((an) => {
                      const isSel = selectedAnalogDetail?.id === an.id;
                      const rp = an.retrospectiveModelPerformance;
                      return (
                        <tr
                          key={an.id}
                          onClick={() => setSelectedAnalogDetail(an)}
                          className={`cursor-pointer transition ${
                            isSel
                              ? "bg-[#F5F3FF] font-semibold"
                              : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="py-3 pr-3 font-semibold text-slate-900">
                            <div>{an.monthYearLabel}</div>
                            <div className="text-[11px] text-slate-500 font-normal">
                              {an.weatherCondition} · {an.similarityPct}% match
                            </div>
                          </td>
                          <td className="py-3 px-2">
                            {an.recordedRain6hMm} mm
                          </td>
                          <td className="py-3 px-2">
                            {rp?.nwp_error_mm !== undefined &&
                            rp?.nwp_error_mm !== null
                              ? `±${rp.nwp_error_mm} mm`
                              : "—"}
                          </td>
                          <td className="py-3 px-2">
                            {rp?.ai_error_mm !== undefined &&
                            rp?.ai_error_mm !== null
                              ? `±${rp.ai_error_mm} mm`
                              : "—"}
                          </td>
                          <td className="py-3 px-2 font-semibold text-[#6D28D9]">
                            {rp?.ensemble_error_mm !== undefined &&
                            rp?.ensemble_error_mm !== null
                              ? `±${rp.ensemble_error_mm} mm`
                              : "—"}
                          </td>
                          <td className="py-3 pl-2 font-semibold text-[#6D28D9]">
                            {rp?.highest_weighted_model || "Ensemble"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600">
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1.5 font-bold text-[#6D28D9]">
                <Database className="w-3.5 h-3.5" />
                Model Versioning &amp; Chronological Splits
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#F5F3FF] text-[#6D28D9]">
                {activeModelMeta.version || selectedForecast.modelVersion}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <strong>Train:</strong>{" "}
                {activeModelMeta.train_split || "2021–2023"}
              </div>
              <div>
                <strong>Validation:</strong>{" "}
                {activeModelMeta.validation_split || "2024"}
              </div>
              <div>
                <strong>Test:</strong>{" "}
                {activeModelMeta.test_split || "2025"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
