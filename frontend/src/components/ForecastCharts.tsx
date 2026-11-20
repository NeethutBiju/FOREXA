import React, { useState } from "react";
import {
  ComputedDistrictForecast,
  HorizonHours,
  HourlyPoint,
  MatchedHistoricalAnalog,
} from "../utils/forecastEngine";

/* ============================================================================
 * 1. FULL-WIDTH RAINFALL OVER TIME CHART (SPACIOUS WHITE & VIOLET PALETTE)
 * ============================================================================ */
export const RainfallOverTimeChart: React.FC<{
  forecast: ComputedDistrictForecast;
  leadTime: HorizonHours;
  darkMode: boolean;
  isTechnicalRole?: boolean;
  onSelectLeadTime?: (h: HorizonHours) => void;
}> = ({
  forecast,
  leadTime,
  isTechnicalRole = true,
  onSelectLeadTime,
}) => {
  const [showNwp, setShowNwp] = useState<boolean>(true);
  const [showAi, setShowAi] = useState<boolean>(true);
  const [showEnsemble, setShowEnsemble] = useState<boolean>(true);
  const [showObserved, setShowObserved] = useState<boolean>(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!forecast.hasNativeStation || forecast.hourlySeries.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h3 className="text-base font-bold text-[#14532D]">
          Rainfall Over Time · {forecast.district.name}
        </h3>
        <p className="text-sm text-slate-500 mt-1.5">
          No station forecast records are available in the dataset for{" "}
          {forecast.district.name}.
        </p>
      </div>
    );
  }

  const series = forecast.hourlySeries;
  const hasAnyBlended = series.some((s) => s.blended !== null);

  if (!hasAnyBlended) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h3 className="text-base font-bold text-[#14532D]">
          Forecast Unavailable · All Model Sources Offline
        </h3>
        <p className="text-sm text-slate-500 mt-1.5">
          Re-enable at least one model source in the Control Room to compute
          blended predictions.
        </p>
      </div>
    );
  }

  const width = 900;
  const height = 285;
  const padL = 60;
  const padR = 32;
  const padT = 32;
  const padB = 44;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxY = Math.max(
    60,
    ...series.map((s) =>
      Math.max(
        s.bandHigh ?? 0,
        s.blended ?? 0,
        s.ensemble ?? 0,
        s.ai ?? 0,
        s.nwp ?? 0,
        s.observed ?? 0
      )
    )
  );

  const getX = (idx: number) =>
    padL + (idx / Math.max(1, series.length - 1)) * plotW;
  const getY = (val: number) =>
    padT + plotH - (Math.min(maxY, Math.max(0, val)) / maxY) * plotH;

  const hasUncertaintyBand = series.every(
    (s) => s.bandLow !== null && s.bandHigh !== null
  );
  const hasIndividualModels =
    isTechnicalRole && series.some((s) => s.nwp !== null || s.ai !== null);
  const hasObserved =
    isTechnicalRole && series.some((s) => s.observed !== null);

  const upperPts = series.map(
    (pt, i) => `${getX(i)},${getY(pt.bandHigh ?? pt.blended ?? 0)}`
  );
  const lowerPts = [...series].reverse().map((pt, revI) => {
    const i = series.length - 1 - revI;
    return `${getX(i)},${getY(pt.bandLow ?? pt.blended ?? 0)}`;
  });
  const uncertaintyBandPath = `M ${upperPts.join(" L ")} L ${lowerPts.join(
    " L "
  )} Z`;

  const makeLinePath = (getter: (p: HourlyPoint) => number | null) => {
    const valid = series
      .map((pt, i) => ({ val: getter(pt), x: getX(i) }))
      .filter((item) => item.val !== null);
    if (valid.length === 0) return "";
    return valid
      .map(
        (item, idx) =>
          `${idx === 0 ? "M" : "L"} ${item.x} ${getY(item.val as number)}`
      )
      .join(" ");
  };

  const blendedPath = makeLinePath((p) => p.blended);
  const nwpPath = makeLinePath((p) => p.nwp);
  const aiPath = makeLinePath((p) => p.ai);
  const ensemblePath = makeLinePath((p) => p.ensemble);
  const observedPath = makeLinePath((p) => p.observed);

  const activeSliderIdx = Math.max(
    0,
    series.findIndex((p) => p.h === leadTime)
  );
  const peakIdx = series.reduce(
    (bestI, pt, idx) =>
      (pt.blended ?? 0) > (series[bestI].blended ?? 0) ? idx : bestI,
    0
  );

  const thresholds = [
    { label: "Extreme threshold (50 mm)", val: 50 },
    { label: "Heavy threshold (35 mm)", val: 35 },
    { label: "Watch threshold (15 mm)", val: 15 },
  ];

  const inspectedIdx = hoverIdx !== null ? hoverIdx : activeSliderIdx;
  const inspectedPt = series[inspectedIdx] || series[0];

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h3 className="text-base font-bold text-[#14532D]">
            Rainfall Over Time (mm / 6h) · {forecast.district.name}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            6h to 72h forecast trajectory · Unified weights: NWP{" "}
            {forecast.weights.nwp}% · AI {forecast.weights.ai}% · Ensemble{" "}
            {forecast.weights.ensemble}%
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#ECFDF5] text-[#14532D] border border-emerald-200">
            <span className="w-3 h-1 rounded-full bg-[#14532D] inline-block" />
            Blended Forecast
          </span>

          {hasIndividualModels && (
            <>
              <button
                type="button"
                onClick={() => setShowNwp(!showNwp)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                  showNwp
                    ? "bg-white text-slate-700 border-slate-200"
                    : "opacity-40 border-slate-200 text-slate-400"
                }`}
              >
                <span className="w-2.5 h-0.5 bg-slate-400 inline-block" />
                NWP ({forecast.weights.nwp}%)
              </button>

              <button
                type="button"
                onClick={() => setShowAi(!showAi)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                  showAi
                    ? "bg-white text-slate-700 border-slate-200"
                    : "opacity-40 border-slate-200 text-slate-400"
                }`}
              >
                <span className="w-2.5 h-0.5 bg-[#16A34A] inline-block" />
                AI ({forecast.weights.ai}%)
              </button>

              <button
                type="button"
                onClick={() => setShowEnsemble(!showEnsemble)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                  showEnsemble
                    ? "bg-white text-slate-700 border-slate-200"
                    : "opacity-40 border-slate-200 text-slate-400"
                }`}
              >
                <span className="w-2.5 h-0.5 bg-[#052E16] inline-block" />
                Ensemble ({forecast.weights.ensemble}%)
              </button>
            </>
          )}

          {hasObserved && false && (
            <button
              type="button"
              onClick={() => setShowObserved(!showObserved)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition ${
                showObserved
                  ? "bg-white text-slate-700 border-slate-200"
                  : "opacity-40 border-slate-200 text-slate-400"
              }`}
            >
              <span className="w-2.5 h-0.5 bg-slate-600 inline-block" />
              Observed
            </button>
          )}
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[620px] select-none"
          role="img"
          aria-label={`Rainfall forecast over 6 to 72 hours for ${forecast.district.name}`}
        >
          {[0, 15, 30, 45, 60, 75].map((yVal) => {
            if (yVal > maxY) return null;
            const y = getY(yVal);
            return (
              <g key={yVal}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="#F1F5F9"
                  strokeWidth="1"
                />
                <text
                  x={padL - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fontWeight="500"
                  fill="#64748B"
                >
                  {yVal} mm
                </text>
              </g>
            );
          })}

          {thresholds.map((th) => {
            if (th.val > maxY) return null;
            const y = getY(th.val);
            return (
              <g key={th.label}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="#BBF7D0"
                  strokeWidth="1"
                  strokeDasharray="5 4"
                />
                <text
                  x={width - padR - 4}
                  y={y - 4}
                  textAnchor="end"
                  fontSize="9.5"
                  fontWeight="600"
                  fill="#15803D"
                >
                  {th.label}
                </text>
              </g>
            );
          })}

          {hasUncertaintyBand && (
            <path
              d={uncertaintyBandPath}
              fill="#16A34A"
              fillOpacity="0.12"
            />
          )}

          {hasIndividualModels && showNwp && nwpPath && (
            <path
              d={nwpPath}
              fill="none"
              stroke="#94A3B8"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
          )}
          {hasIndividualModels && showAi && aiPath && (
            <path
              d={aiPath}
              fill="none"
              stroke="#16A34A"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          )}
          {hasIndividualModels && showEnsemble && ensemblePath && (
            <path
              d={ensemblePath}
              fill="none"
              stroke="#052E16"
              strokeWidth="1.5"
              strokeDasharray="6 3"
            />
          )}
          {hasObserved && showObserved && observedPath && (
            <path
              d={observedPath}
              fill="none"
              stroke="#475569"
              strokeWidth="1.8"
              strokeDasharray="2 2"
            />
          )}

          <path
            d={blendedPath}
            fill="none"
            stroke="#14532D"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <g>
            <line
              x1={getX(activeSliderIdx)}
              y1={padT}
              x2={getX(activeSliderIdx)}
              y2={height - padB}
              stroke="#14532D"
              strokeWidth="1.8"
              strokeDasharray="3 3"
            />
            <rect
              x={getX(activeSliderIdx) - 36}
              y={4}
              width="72"
              height="18"
              rx="9"
              fill="#14532D"
            />
            <text
              x={getX(activeSliderIdx)}
              y={16}
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#FFFFFF"
            >
              +{leadTime}h
            </text>
          </g>

          <g>
            <circle
              cx={getX(peakIdx)}
              cy={getY(series[peakIdx].blended ?? 0)}
              r="5.5"
              fill="#052E16"
              stroke="#FFFFFF"
              strokeWidth="2"
            />
            <rect
              x={Math.min(width - 185, Math.max(padL, getX(peakIdx) - 82))}
              y={Math.max(padT + 2, getY(series[peakIdx].blended ?? 0) - 28)}
              width="165"
              height="20"
              rx="6"
              fill="#052E16"
            />
            <text
              x={
                Math.min(width - 185, Math.max(padL, getX(peakIdx) - 82)) + 82
              }
              y={
                Math.max(padT + 2, getY(series[peakIdx].blended ?? 0) - 28) + 13
              }
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="#FFFFFF"
            >
              Peak: {series[peakIdx].blended} mm at +{series[peakIdx].h}h
            </text>
          </g>

          {series.map((pt, idx) => {
            const cx = getX(idx);
            const cy = getY(pt.blended ?? 0);
            const isActive = pt.h === leadTime;
            const isHovered = hoverIdx === idx;
            return (
              <g
                key={pt.h}
                className="cursor-pointer"
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(null)}
                onClick={() => onSelectLeadTime?.(pt.h)}
              >
                <rect
                  x={cx - 20}
                  y={padT}
                  width="40"
                  height={plotH}
                  fill="transparent"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={isActive || isHovered ? 5 : 3.5}
                  fill={isActive ? "#14532D" : "#FFFFFF"}
                  stroke="#14532D"
                  strokeWidth="2"
                />
                <text
                  x={cx}
                  y={height - 16}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight={isActive ? "700" : "500"}
                  fill={isActive ? "#14532D" : "#64748B"}
                >
                  +{pt.h}h
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-4 px-5 py-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-700">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-[#14532D]">
            +{inspectedPt.h}h Readout:
          </span>
          <span className="font-bold text-slate-900">
            Blended {inspectedPt.blended ?? "—"} mm / 6h
          </span>
          {inspectedPt.bandLow !== null && inspectedPt.bandHigh !== null && (
            <span className="text-slate-500">
              (Range: {inspectedPt.bandLow}–{inspectedPt.bandHigh} mm)
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-slate-600">
          {hasIndividualModels && (
            <>
              <span>
                NWP: <strong className="text-slate-900">{inspectedPt.nwp ?? "—"} mm</strong>
              </span>
              <span>
                AI: <strong className="text-slate-900">{inspectedPt.ai ?? "—"} mm</strong>
              </span>
              <span>
                Ensemble:{" "}
                <strong className="text-slate-900">{inspectedPt.ensemble ?? "—"} mm</strong>
              </span>
            </>
          )}
          {hasObserved && inspectedPt.observed !== null && (
            <span>
              Observed: <strong className="text-[#14532D]">{inspectedPt.observed} mm</strong>
            </span>
          )}
          <span>
            Wind: <strong className="text-slate-900">{inspectedPt.windMs ?? "—"} m/s</strong>
          </span>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. MINI 6H–72H RAINFALL CHART FOR DISTRICT DETAIL DRAWER
 * ============================================================================ */
export const MiniDrawerRainfallChart: React.FC<{
  forecast: ComputedDistrictForecast;
  leadTime: HorizonHours;
}> = ({ forecast, leadTime }) => {
  const series = forecast.hourlySeries.filter((s) => s.blended !== null);
  if (series.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-slate-400">
        No forecast series available for this district.
      </div>
    );
  }
  const width = 340;
  const height = 110;
  const padL = 26;
  const padR = 14;
  const padT = 20;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxY = Math.max(
    45,
    ...series.map((s) => Math.max(s.bandHigh ?? 0, s.blended ?? 0))
  );

  const getX = (idx: number) =>
    padL + (idx / Math.max(1, series.length - 1)) * plotW;
  const getY = (val: number) =>
    padT + plotH - (Math.min(maxY, Math.max(0, val)) / maxY) * plotH;

  const pathD = series
    .map(
      (pt, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(pt.blended ?? 0)}`
    )
    .join(" ");

  const areaD = `${pathD} L ${getX(series.length - 1)} ${
    padT + plotH
  } L ${getX(0)} ${padT + plotH} Z`;

  const peakIdx = series.reduce(
    (bestI, pt, idx) =>
      (pt.blended ?? 0) > (series[bestI].blended ?? 0) ? idx : bestI,
    0
  );

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      aria-label="6h-72h mini rainfall trajectory"
    >
      <path d={areaD} fill="#14532D" fillOpacity="0.10" />
      <path
        d={pathD}
        fill="none"
        stroke="#14532D"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {series.map((pt, i) => (
        <g key={pt.h}>
          <circle
            cx={getX(i)}
            cy={getY(pt.blended ?? 0)}
            r={pt.h === leadTime ? 4 : 2.5}
            fill={pt.h === leadTime ? "#14532D" : "#FFFFFF"}
            stroke="#14532D"
            strokeWidth="1.8"
          />
          {i % 2 === 1 && (
            <text
              x={getX(i)}
              y={height - 4}
              textAnchor="middle"
              fontSize="8"
              fontWeight={pt.h === leadTime ? "700" : "500"}
              fill="#64748B"
            >
              +{pt.h}h
            </text>
          )}
        </g>
      ))}
      <circle
        cx={getX(peakIdx)}
        cy={getY(series[peakIdx].blended ?? 0)}
        r="4"
        fill="#052E16"
        stroke="#FFFFFF"
        strokeWidth="1.5"
      />
      <text
        x={Math.min(width - 55, Math.max(45, getX(peakIdx)))}
        y={Math.max(11, getY(series[peakIdx].blended ?? 0) - 6)}
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="700"
        fill="#14532D"
      >
        Peak {series[peakIdx].blended} mm (+{series[peakIdx].h}h)
      </text>
    </svg>
  );
};

/* ============================================================================
 * 3. HISTORICAL ANALOG OVERLAY CHART (VIOLET & SLATE)
 * ============================================================================ */
export const AnalogOverlayChart: React.FC<{
  forecast: ComputedDistrictForecast;
  analog: MatchedHistoricalAnalog;
  darkMode: boolean;
}> = ({ forecast, analog }) => {
  const obs = analog.observedCurve || [];
  const fcstPts = forecast.hourlySeries
    .filter((s) => s.blended !== null)
    .slice(0, Math.max(obs.length, 7));

  if (obs.length === 0) {
    return (
      <div className="text-xs text-slate-400 py-4">
        Observed time-series profile unavailable for this record.
      </div>
    );
  }

  const width = 560;
  const height = 180;
  const padL = 46;
  const padR = 20;
  const padT = 22;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxY = Math.max(
    45,
    ...fcstPts.map((s) => s.blended ?? 0),
    ...obs
  );

  const getX = (idx: number, total: number) =>
    padL + (idx / Math.max(1, total - 1)) * plotW;
  const getY = (val: number) =>
    padT + plotH - (Math.min(maxY, Math.max(0, val)) / maxY) * plotH;

  const currentPath = fcstPts
    .map(
      (pt, i) =>
        `${i === 0 ? "M" : "L"} ${getX(i, fcstPts.length)} ${getY(
          pt.blended ?? 0
        )}`
    )
    .join(" ");

  const analogPath = obs
    .map(
      (val, i) => `${i === 0 ? "M" : "L"} ${getX(i, obs.length)} ${getY(val)}`
    )
    .join(" ");

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
        <span className="font-bold text-[#14532D]">
          Current Forecast vs {analog.monthYearLabel} Observation
        </span>
        <div className="flex items-center gap-4 text-[11px] font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1 bg-[#14532D] inline-block rounded" />
            Current Forecast ({forecast.district.name})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-b-2 border-dashed border-slate-500 inline-block" />
            Observed Curve ({analog.dateRange})
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        aria-label="Overlay chart comparing current forecast curve with historical observation"
      >
        {[0, 15, 30, 45, 60].map((yVal) => {
          if (yVal > maxY) return null;
          const y = getY(yVal);
          return (
            <g key={yVal}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="#F1F5F9"
                strokeWidth="1"
              />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fontWeight="500"
                fill="#64748B"
              >
                {yVal} mm
              </text>
            </g>
          );
        })}

        {analogPath && (
          <path
            d={analogPath}
            fill="none"
            stroke="#64748B"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
        )}
        {currentPath && (
          <path
            d={currentPath}
            fill="none"
            stroke="#14532D"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        )}

        {obs.map((val, i) => (
          <g key={i}>
            <circle
              cx={getX(i, obs.length)}
              cy={getY(val)}
              r="3"
              fill="#64748B"
            />
            <text
              x={getX(i, obs.length)}
              y={height - 8}
              textAnchor="middle"
              fontSize="9"
              fontWeight="500"
              fill="#64748B"
            >
              Step {i + 1}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

/* ============================================================================
 * 4. UNIFIED ADAPTIVE WEIGHT OVER LEAD TIME (6H–72H)
 * ============================================================================ */
export const WeightOverLeadTimeChart: React.FC<{
  forecast: ComputedDistrictForecast;
  leadTime: HorizonHours;
  darkMode: boolean;
}> = ({ forecast, leadTime }) => {
  const weightsSeries = forecast.weightsOverLeadTime;
  const width = 760;
  const height = 225;
  const padL = 48;
  const padR = 24;
  const padT = 22;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const getX = (idx: number) =>
    padL + (idx / Math.max(1, weightsSeries.length - 1)) * plotW;
  const getY = (pct: number) =>
    padT + plotH - (Math.min(100, Math.max(0, pct)) / 100) * plotH;

  const makePath = (key: "nwp" | "ai" | "ensemble") =>
    weightsSeries
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${getX(i)} ${getY(pt[key])}`)
      .join(" ");

  const activeIdx = Math.max(
    0,
    weightsSeries.findIndex((w) => w.h === leadTime)
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-xs text-slate-500">
          Unified weight trajectory across 6h–72h (shared across all districts
          and variables)
        </div>
        <div className="flex items-center gap-5 text-xs font-semibold text-slate-700">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1 bg-slate-400 rounded inline-block" />
            NWP %
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1 bg-[#16A34A] rounded inline-block" />
            AI %
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-1 bg-[#14532D] rounded inline-block" />
            Ensemble %
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        aria-label="Unified adaptive model weights across 6h to 72h"
      >
        {[0, 25, 50, 75, 100].map((pct) => {
          const y = getY(pct);
          return (
            <g key={pct}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                stroke="#F1F5F9"
                strokeWidth="1"
              />
              <text
                x={padL - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fontWeight="500"
                fill="#64748B"
              >
                {pct}%
              </text>
            </g>
          );
        })}

        <line
          x1={getX(activeIdx)}
          y1={padT}
          x2={getX(activeIdx)}
          y2={height - padB}
          stroke="#14532D"
          strokeWidth="1.6"
          strokeDasharray="3 3"
        />

        <path
          d={makePath("nwp")}
          fill="none"
          stroke="#94A3B8"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d={makePath("ai")}
          fill="none"
          stroke="#16A34A"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d={makePath("ensemble")}
          fill="none"
          stroke="#14532D"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {weightsSeries.map((pt, i) => (
          <g key={pt.h}>
            <circle cx={getX(i)} cy={getY(pt.nwp)} r="3" fill="#94A3B8" />
            <circle cx={getX(i)} cy={getY(pt.ai)} r="3" fill="#16A34A" />
            <circle
              cx={getX(i)}
              cy={getY(pt.ensemble)}
              r="3.5"
              fill="#14532D"
            />
            <text
              x={getX(i)}
              y={height - 10}
              textAnchor="middle"
              fontSize="10"
              fontWeight={pt.h === leadTime ? "700" : "500"}
              fill={pt.h === leadTime ? "#14532D" : "#64748B"}
            >
              +{pt.h}h
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
