import React, { useMemo, useState } from "react";
import { BarChart3, Layers, TrendingUp } from "lucide-react";
import {
  ComputedDistrictForecast,
  HorizonHours,
} from "../utils/forecastEngine";
import {
  KERALA_14_DISTRICTS,
  trackAnalyticsEvent,
  UserSession,
} from "../firebase";

interface VisualizationTabProps {
  allForecasts: ComputedDistrictForecast[];
  selectedForecast: ComputedDistrictForecast;
  leadTime: HorizonHours;
  session: UserSession | null;
  onSelectDistrict: (name: string) => void;
}

type WeatherRegimeOption =
  | "Heavy Rainfall"
  | "Extreme Rainfall"
  | "High Wind / Gusts"
  | "Normal Monsoon";

const LEAD_TICKS = [1, 6, 12, 24, 48, 72] as const;

export const VisualizationTab: React.FC<VisualizationTabProps> = ({
  allForecasts,
  selectedForecast,
  leadTime,
  onSelectDistrict,
}) => {
  const [chartDistrict, setChartDistrict] = useState<string>(
    selectedForecast.district.name || "Wayanad"
  );
  const [chartLead, setChartLead] = useState<number>(leadTime || 12);
  const [weatherRegime, setWeatherRegime] =
    useState<WeatherRegimeOption>("Heavy Rainfall");
  const [hoveredBarIdx, setHoveredBarIdx] = useState<number | null>(null);

  // Monitored districts ranked by blended 6h rainfall intensity for the vertical GA-style Column Bar Chart
  const priorityDistricts = useMemo(() => {
    return allForecasts
      .filter((f) => f.hasNativeStation && f.rain6hMm !== null)
      .sort((a, b) => (b.rain6hMm || 0) - (a.rain6hMm || 0));
  }, [allForecasts]);

  const maxRain = Math.max(
    60,
    ...priorityDistricts.map((d) => d.rain6hMm || 0)
  );

  // Dynamic 100% stacked contribution timeline responding to District + Weather Regime + Lead Time
  // Matches Reference Image 1 ("CONTRIBUTION TIMELINE — How the blend changes with lead time")
  const contributionTimeline = useMemo(() => {
    const distIdx = Math.max(0, KERALA_14_DISTRICTS.indexOf(chartDistrict));
    const distShift = ((distIdx % 5) - 2) * 1.2;

    const regimeBase: Record<
      WeatherRegimeOption,
      { nwp: number; ai: number; ens: number }
    > = {
      "Heavy Rainfall": { nwp: 27, ai: 41, ens: 32 },
      "Extreme Rainfall": { nwp: 18, ai: 38, ens: 44 },
      "High Wind / Gusts": { nwp: 24, ai: 44, ens: 32 },
      "Normal Monsoon": { nwp: 31, ai: 39, ens: 30 },
    };

    const base = regimeBase[weatherRegime];

    return LEAD_TICKS.map((h, i) => {
      // As lead time increases (+1h -> +72h), NWP slightly decreases while Ensemble increases
      const nwpRaw = Math.max(
        10,
        Math.round(base.nwp - i * 0.9 + distShift * 0.5)
      );
      const ensRaw = Math.max(
        15,
        Math.round(base.ens + i * 1.1 - distShift * 0.3)
      );
      const aiRaw = Math.max(10, 100 - nwpRaw - ensRaw);
      return {
        h,
        label: `+${h}h`,
        nwp: nwpRaw,
        ai: aiRaw,
        ens: ensRaw,
      };
    });
  }, [chartDistrict, weatherRegime]);

  // SVG dimensions for 100% Stacked Area Chart (Reference Image 1)
  const areaW = 920;
  const areaH = 310;
  const aPadL = 48;
  const aPadR = 24;
  const aPadT = 20;
  const aPadB = 36;
  const aPlotW = areaW - aPadL - aPadR;
  const aPlotH = areaH - aPadT - aPadB;

  const getAX = (i: number) =>
    aPadL + (i / (contributionTimeline.length - 1)) * aPlotW;
  const getAY = (pct: number) => aPadT + aPlotH - (pct / 100) * aPlotH;

  // Build stacked polygons: bottom = NWP (0 -> nwp), middle = AI (nwp -> nwp+ai), top = Ensemble (nwp+ai -> 100)
  const nwpPoly = [
    ...contributionTimeline.map((pt, i) => `${getAX(i)},${getAY(pt.nwp)}`),
    ...contributionTimeline
      .slice()
      .reverse()
      .map((_, revI) => `${getAX(contributionTimeline.length - 1 - revI)},${getAY(0)}`),
  ].join(" ");

  const aiPoly = [
    ...contributionTimeline.map(
      (pt, i) => `${getAX(i)},${getAY(pt.nwp + pt.ai)}`
    ),
    ...contributionTimeline
      .slice()
      .reverse()
      .map(
        (pt, revI) =>
          `${getAX(contributionTimeline.length - 1 - revI)},${getAY(pt.nwp)}`
      ),
  ].join(" ");

  const ensPoly = [
    ...contributionTimeline.map((_, i) => `${getAX(i)},${getAY(100)}`),
    ...contributionTimeline
      .slice()
      .reverse()
      .map(
        (pt, revI) =>
          `${getAX(contributionTimeline.length - 1 - revI)},${getAY(
            pt.nwp + pt.ai
          )}`
      ),
  ].join(" ");

  // SVG dimensions for Vertical Google Analytics-style Bar Chart
  const barW = 920;
  const barH = 300;
  const bPadL = 56;
  const bPadR = 24;
  const bPadT = 30;
  const bPadB = 56;
  const bPlotW = barW - bPadL - bPadR;
  const bPlotH = barH - bPadT - bPadB;

  return (
    <div className="space-y-8">
      {/* ====================================================================
       * 1. HIGH-PRIORITY DISTRICTS — VERTICAL BAR CHART (GOOGLE ANALYTICS)
       * ==================================================================== */}
      <section className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#15803D]">
              Priority Ranking Analytics
            </span>
            <h2 className="text-lg font-bold text-[#14532D] mt-0.5 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              <span>High-Priority Kerala Districts (+{leadTime}h Rainfall)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any district column to inspect its live forecast and track
              priority analytics
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#ECFDF5] border border-emerald-200 text-xs font-semibold text-[#14532D]">
            <TrendingUp className="w-3.5 h-3.5 text-[#15803D]" />
            <span>Google Analytics Connected · G-LXDM92KRZ6</span>
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${barW} ${barH}`}
            className="w-full h-auto min-w-[640px] select-none"
            role="img"
            aria-label="High priority districts rainfall vertical bar chart"
          >
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
              const val = Math.round(maxRain * frac);
              const y = bPadT + bPlotH - frac * bPlotH;
              return (
                <g key={idx}>
                  <line
                    x1={bPadL}
                    y1={y}
                    x2={barW - bPadR}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeDasharray={frac === 0 ? undefined : "3 4"}
                    strokeWidth="1"
                  />
                  <text
                    x={bPadL - 10}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fill="#64748B"
                    fontWeight="600"
                  >
                    {val} mm
                  </text>
                </g>
              );
            })}

            {/* Vertical Columns */}
            {priorityDistricts.map((d, i) => {
              const rain = d.rain6hMm || 0;
              const slotW = bPlotW / Math.max(1, priorityDistricts.length);
              const colW = Math.min(54, slotW * 0.58);
              const cx = bPadL + slotW * i + slotW / 2;
              const colH = Math.max(6, (rain / maxRain) * bPlotH);
              const y = bPadT + bPlotH - colH;
              const isHovered = hoveredBarIdx === i;
              const isSelected =
                d.district.name.toLowerCase() === chartDistrict.toLowerCase();

              const barFill =
                d.severity === "RED"
                  ? "#DC2626"
                  : d.severity === "ORANGE"
                  ? "#EA580C"
                  : "#15803D";

              return (
                <g
                  key={d.district.name}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredBarIdx(i)}
                  onMouseLeave={() => setHoveredBarIdx(null)}
                  onClick={() => {
                    setChartDistrict(d.district.name);
                    onSelectDistrict(d.district.name);
                    trackAnalyticsEvent("select_priority_district_bar", {
                      district: d.district.name,
                      rain_6h_mm: rain,
                      severity: d.severity,
                      lead_h: leadTime,
                    });
                  }}
                >
                  <rect
                    x={cx - colW / 2}
                    y={y}
                    width={colW}
                    height={colH}
                    rx="7"
                    fill={barFill}
                    opacity={isHovered || isSelected ? 1 : 0.85}
                    stroke={isSelected ? "#052E16" : "none"}
                    strokeWidth={isSelected ? 2 : 0}
                  />
                  <text
                    x={cx}
                    y={y - 8}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="#0F172A"
                  >
                    {rain} mm
                  </text>
                  <text
                    x={cx}
                    y={bPadT + bPlotH + 20}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={isSelected ? "800" : "600"}
                    fill={isSelected ? "#14532D" : "#334155"}
                  >
                    {d.district.name.length > 11
                      ? `${d.district.name.slice(0, 9)}…`
                      : d.district.name}
                  </text>
                  <text
                    x={cx}
                    y={bPadT + bPlotH + 35}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="600"
                    fill="#64748B"
                  >
                    Priority #{i + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* ====================================================================
       * 2. DYNAMIC WEIGHT VISUALIZATION (MATCHES REFERENCE IMAGE 1)
       *    FILTER BAR (DISTRICT, LEAD TIME, WEATHER REGIME — NO STATE!)
       * ==================================================================== */}
      <section className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3 rounded-xl border border-slate-200 bg-white">
            <label
              htmlFor="viz-district"
              className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
            >
              DISTRICT
            </label>
            <select
              id="viz-district"
              value={chartDistrict}
              onChange={(e) => {
                setChartDistrict(e.target.value);
                onSelectDistrict(e.target.value);
                trackAnalyticsEvent("change_blend_district", {
                  district: e.target.value,
                });
              }}
              className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
            >
              {KERALA_14_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 bg-white">
            <label
              htmlFor="viz-lead"
              className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
            >
              LEAD TIME
            </label>
            <select
              id="viz-lead"
              value={chartLead}
              onChange={(e) => {
                const v = Number(e.target.value);
                setChartLead(v);
                trackAnalyticsEvent("change_blend_lead_time", { lead_h: v });
              }}
              className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
            >
              {LEAD_TICKS.map((h) => (
                <option key={h} value={h}>
                  {h} {h === 1 ? "hour" : "hours"}
                </option>
              ))}
            </select>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 bg-white">
            <label
              htmlFor="viz-regime"
              className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1"
            >
              WEATHER REGIME
            </label>
            <select
              id="viz-regime"
              value={weatherRegime}
              onChange={(e) => {
                const r = e.target.value as WeatherRegimeOption;
                setWeatherRegime(r);
                trackAnalyticsEvent("change_blend_regime", { regime: r });
              }}
              className="w-full text-sm font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="Heavy Rainfall">Heavy Rainfall</option>
              <option value="Extreme Rainfall">Extreme Rainfall</option>
              <option value="High Wind / Gusts">High Wind / Gusts</option>
              <option value="Normal Monsoon">Normal Monsoon</option>
            </select>
          </div>
        </div>
      </section>

      {/* CONTRIBUTION TIMELINE — 100% STACKED AREA CHART (Reference Image 1) */}
      <section className="rounded-2xl bg-white border border-slate-200/90 p-6 sm:p-7 shadow-sm space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#15803D]">
              CONTRIBUTION TIMELINE
            </span>
            <h2 className="text-xl font-bold text-[#14532D] mt-0.5 flex items-center gap-2">
              <Layers className="w-5 h-5" />
              <span>How the blend changes with lead time</span>
            </h2>
          </div>

          <span className="px-3.5 py-1.5 rounded-lg bg-[#ECFDF5] border border-emerald-200 text-xs font-bold text-[#14532D]">
            Total 100%
          </span>
        </div>

        {/* Legend matching Reference Image 1 */}
        <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-slate-600">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-[#5490C4] inline-block" />
            <span>NWP</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-[#499B79] inline-block" />
            <span>AI model</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm bg-[#9B7EC8] inline-block" />
            <span>Ensemble</span>
          </span>
          <span className="text-slate-400 font-medium">
            · {chartDistrict} · {weatherRegime} (Active Focus: +{chartLead}h)
          </span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${areaW} ${areaH}`}
            className="w-full h-auto min-w-[640px] select-none"
            role="img"
            aria-label="How the model blend changes with lead time stacked area chart"
          >
            {/* Y-Axis labels */}
            {[0, 25, 50, 75, 100].map((pct) => {
              const y = getAY(pct);
              return (
                <g key={pct}>
                  <line
                    x1={aPadL}
                    y1={y}
                    x2={areaW - aPadR}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeWidth="1"
                  />
                  <text
                    x={aPadL - 10}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fontWeight="600"
                    fill="#64748B"
                  >
                    {pct}%
                  </text>
                </g>
              );
            })}

            {/* Stacked Areas */}
            <polygon points={ensPoly} fill="#9B7EC8" opacity="0.92" />
            <polygon points={aiPoly} fill="#499B79" opacity="0.94" />
            <polygon points={nwpPoly} fill="#5490C4" opacity="0.94" />

            {/* Active Lead Marker Line */}
            {contributionTimeline.map((pt, i) => {
              const x = getAX(i);
              const isFocus = pt.h === chartLead;
              const nwpMidY = getAY(pt.nwp / 2);
              const aiMidY = getAY(pt.nwp + pt.ai / 2);
              const ensMidY = getAY(pt.nwp + pt.ai + pt.ens / 2);
              return (
                <g key={pt.h}>
                  {isFocus && (
                    <line
                      x1={x}
                      y1={aPadT}
                      x2={x}
                      y2={aPadT + aPlotH}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                      strokeDasharray="4 4"
                      opacity="0.85"
                    />
                  )}
                  <text
                    x={x}
                    y={ensMidY + 4}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="800"
                    fill="#FFFFFF"
                  >
                    {pt.ens}%
                  </text>
                  <text
                    x={x}
                    y={aiMidY + 4}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="800"
                    fill="#FFFFFF"
                  >
                    {pt.ai}%
                  </text>
                  <text
                    x={x}
                    y={nwpMidY + 4}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="800"
                    fill="#FFFFFF"
                  >
                    {pt.nwp}%
                  </text>

                  {/* X-Axis Lead Labels */}
                  <text
                    x={x}
                    y={aPadT + aPlotH + 22}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight={isFocus ? "800" : "600"}
                    fill={isFocus ? "#14532D" : "#475569"}
                  >
                    {pt.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>
    </div>
  );
};
