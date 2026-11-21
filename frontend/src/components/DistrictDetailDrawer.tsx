import React, { useEffect, useState } from "react";
import {
  X,
  ArrowUpRight,
  GitCompare,
  Droplets,
  Wind,
  Thermometer,
  Gauge,
  Clock,
  ShieldAlert,
  History,
  CheckCircle2,
} from "lucide-react";
import {
  ComputedDistrictForecast,
  HorizonHours,
  MatchedHistoricalAnalog,
} from "../utils/forecastEngine";
import { EventIcon, SeverityChip } from "./WeatherIcons";
import { MiniDrawerRainfallChart } from "./ForecastCharts";

interface DistrictDetailDrawerProps {
  open: boolean;
  forecast: ComputedDistrictForecast;
  allForecasts: ComputedDistrictForecast[];
  bestAnalog?: MatchedHistoricalAnalog;
  leadTime: HorizonHours;
  darkMode: boolean;
  isTechnicalRole: boolean;
  onClose: () => void;
  onJumpToInsights: () => void;
  onJumpToAnalogs: () => void;
}

const SingleDistrictColumn: React.FC<{
  forecast: ComputedDistrictForecast;
  bestAnalog?: MatchedHistoricalAnalog;
  leadTime: HorizonHours;
  isTechnicalRole: boolean;
  onJumpToAnalogs: () => void;
}> = ({
  forecast,
  bestAnalog,
  leadTime,
  isTechnicalRole,
  onJumpToAnalogs,
}) => {
  if (!forecast.hasNativeStation) {
    return (
      <div className="space-y-5">
        <div className="p-6 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#14532D]">
              {forecast.district.name}
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
              Unmonitored
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-3 leading-relaxed">
            No station or forecast records are currently available for{" "}
            {forecast.district.name}.
          </p>
          {isTechnicalRole && (
            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600">
              <strong className="text-[#14532D]">Unified Weights:</strong> NWP{" "}
              {forecast.weights.nwp}% · AI {forecast.weights.ai}% · Ensemble{" "}
              {forecast.weights.ensemble}%
            </div>
          )}
        </div>
      </div>
    );
  }

  const ind = forecast.modelVariablesAtHorizon;

  return (
    <div className="space-y-5">
      {/* 1. Header Banner */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-[#ECFDF5] text-[#14532D]">
              <EventIcon type={forecast.iconType} className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-[#14532D]">
                {forecast.district.name}
              </h3>
              <p className="text-xs font-medium text-slate-600">
                {forecast.eventType} · Rank #{forecast.rank} of 14
              </p>
            </div>
          </div>
          <SeverityChip severity={forecast.severity} size="sm" />
        </div>
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-500">
          <span>
            {forecast.district.terrain} ({forecast.district.elevationM}m)
          </span>
          <span className="font-semibold text-slate-700">
            Valid: {forecast.validTime}
          </span>
        </div>
      </div>

      {/* 2. Key Numbers Grid */}
      <div className="grid grid-cols-2 gap-3.5">
        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#14532D]">
            <Droplets className="w-3.5 h-3.5" />
            <span>Blended Rainfall</span>
          </div>
          <div className="text-lg font-bold text-slate-900 mt-1">
            {forecast.rain6hMm !== null ? `${forecast.rain6hMm} mm / 6h` : "—"}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Rate:{" "}
            {forecast.rainRateMmH !== null
              ? `${forecast.rainRateMmH} mm/h`
              : "—"}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#14532D]">
            <Wind className="w-3.5 h-3.5" />
            <span>Wind Speed</span>
          </div>
          <div className="text-lg font-bold text-slate-900 mt-1">
            {forecast.currentPoint.windMs !== null
              ? `${forecast.currentPoint.windMs} m/s`
              : "—"}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {forecast.currentPoint.windKmh !== null
              ? `${forecast.currentPoint.windKmh} km/h`
              : "—"}
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#14532D]">
            <Thermometer className="w-3.5 h-3.5" />
            <span>Temp &amp; Humidity</span>
          </div>
          <div className="text-base font-bold text-slate-900 mt-1">
            {forecast.currentPoint.tempC ?? "—"}°C ·{" "}
            {forecast.currentPoint.humidityPct ?? "—"}%
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Spread: ±{forecast.uncertaintyIndicators.precipSpreadMm ?? "—"} mm
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#14532D]">
            <Gauge className="w-3.5 h-3.5" />
            <span>Pressure &amp; Prob</span>
          </div>
          <div className="text-base font-bold text-slate-900 mt-1">
            {forecast.currentPoint.pressureHpa !== null
              ? `${forecast.currentPoint.pressureHpa} hPa`
              : "—"}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Rain Prob:{" "}
            {forecast.eventProbabilityPct !== null
              ? `${forecast.eventProbabilityPct}%`
              : "—"}
          </div>
        </div>
      </div>

      {/* 3. Detected Meteorological Events & Possible Impacts */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
        <div className="flex items-center justify-between text-xs font-medium text-slate-600">
          <span className="inline-flex items-center gap-1.5 text-[#14532D] font-semibold">
            <Clock className="w-3.5 h-3.5" />
            Lead Window: +{forecast.leadTimeHours}h
          </span>
          <span>Duration: {forecast.durationHours}h</span>
        </div>

        <div>
          <div className="text-xs font-bold text-[#14532D] mb-1.5">
            Detected Meteorological Events
          </div>
          <div className="flex flex-wrap gap-2">
            {forecast.detectedMeteorologicalEvents.map((ev) => (
              <span
                key={ev}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-[#ECFDF5] text-slate-800 border border-emerald-100"
              >
                {ev}
              </span>
            ))}
          </div>
        </div>

        {forecast.possibleImpacts.length > 0 && (
          <div>
            <div className="text-xs font-bold text-[#14532D] mb-1.5">
              Possible Terrain Impacts
            </div>
            <div className="flex flex-wrap gap-2">
              {forecast.possibleImpacts.map((imp) => (
                <span
                  key={imp}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200"
                >
                  {imp}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Mini Rainfall Chart */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[#14532D]">
            6h–72h Rainfall Profile (mm / 6h)
          </span>
          <span className="text-xs font-semibold text-slate-600">
            Peak {forecast.peakPoint.mm6h} mm at +{forecast.peakPoint.h}h
          </span>
        </div>
        <MiniDrawerRainfallChart forecast={forecast} leadTime={leadTime} />
      </div>

      {/* 5. Unified Adaptive Weights & Individual Predictions (Technical Role Only) */}
      {isTechnicalRole && (
        <div className="p-5 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#14532D]">
              Unified Adaptive Weights (+{leadTime}h)
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              Shared statewide
            </span>
          </div>

          <div className="w-full h-2 rounded-full overflow-hidden flex bg-slate-100 mb-4">
            <div
              style={{ width: `${forecast.weights.nwp}%` }}
              className="bg-slate-400 transition-all duration-300"
            />
            <div
              style={{ width: `${forecast.weights.ai}%` }}
              className="bg-[#16A34A] transition-all duration-300"
            />
            <div
              style={{ width: `${forecast.weights.ensemble}%` }}
              className="bg-[#14532D] transition-all duration-300"
            />
          </div>

          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500">
                NWP ({forecast.weights.nwp}%)
              </div>
              <div className="font-bold text-slate-900 mt-1">
                {ind.nwp?.precip_6h_mm !== undefined &&
                ind.nwp?.precip_6h_mm !== null
                  ? `${ind.nwp.precip_6h_mm} mm`
                  : "Offline"}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-500">
                AI ({forecast.weights.ai}%)
              </div>
              <div className="font-bold text-slate-900 mt-1">
                {ind.ai?.precip_6h_mm !== undefined &&
                ind.ai?.precip_6h_mm !== null
                  ? `${ind.ai.precip_6h_mm} mm`
                  : "Offline"}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#ECFDF5] border border-emerald-200">
              <div className="text-[11px] font-semibold text-[#14532D]">
                Ensemble ({forecast.weights.ensemble}%)
              </div>
              <div className="font-bold text-slate-900 mt-1">
                {ind.ensemble?.precip_6h_mm !== undefined &&
                ind.ensemble?.precip_6h_mm !== null
                  ? `${ind.ensemble.precip_6h_mm} mm`
                  : "Offline"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Confidence Meter */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[#14532D]">
            Forecast Confidence
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ECFDF5] text-[#14532D]">
            {forecast.confidence} Confidence
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden mb-2">
          <div
            className="h-full bg-[#14532D] rounded-full transition-all"
            style={{
              width:
                forecast.confidenceScore !== null
                  ? `${Math.round(forecast.confidenceScore * 100)}%`
                  : "75%",
            }}
          />
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          {String(forecast.confidenceReason || "").replace(
            /^\[[^\]]*\]\s*confidence:/i,
            `${forecast.confidence} confidence:`
          )}
        </p>
      </div>

      {/* 7. Historical Analog Preview */}
      {bestAnalog && (
        <div className="p-5 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14532D]">
              <History className="w-3.5 h-3.5" />
              Historical Match: {bestAnalog.monthYearLabel}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ECFDF5] text-[#14532D]">
              {bestAnalog.similarityPct}% Match
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1.5">
            Observed 6h rainfall: {bestAnalog.recordedRain6hMm} mm ·{" "}
            {bestAnalog.weatherCondition}
          </p>
          <button
            type="button"
            onClick={onJumpToAnalogs}
            className="mt-2 text-xs font-semibold text-[#14532D] hover:underline"
          >
            View historical comparison ↓
          </button>
        </div>
      )}

      {/* 8. Preparedness Recommendations */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center gap-1.5 text-xs font-bold mb-3 text-[#14532D]">
          <ShieldAlert className="w-4 h-4" />
          <span>Preparedness Recommendations</span>
        </div>
        <ul className="space-y-2 text-xs text-slate-700">
          {forecast.recommendedActions.map((act, i) => (
            <li key={i} className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#14532D] shrink-0 mt-0.5" />
              <span>{act}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export const DistrictDetailDrawer: React.FC<DistrictDetailDrawerProps> = ({
  open,
  forecast,
  allForecasts,
  bestAnalog,
  leadTime,
  isTechnicalRole,
  onClose,
  onJumpToInsights,
  onJumpToAnalogs,
}) => {
  const [compareDistrictName, setCompareDistrictName] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const compareForecast = compareDistrictName
    ? allForecasts.find(
        (f) =>
          f.district.name.toLowerCase() === compareDistrictName.toLowerCase()
      ) || null
    : null;

  const handleToggleCompare = () => {
    if (compareDistrictName) {
      setCompareDistrictName(null);
    } else {
      const other = allForecasts.find(
        (f) =>
          f.district.name !== forecast.district.name && f.hasNativeStation
      );
      if (other) setCompareDistrictName(other.district.name);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end items-end sm:items-stretch bg-slate-900/30 backdrop-blur-[1px] transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`District Detail Panel for ${forecast.district.name}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${
          compareForecast ? "sm:max-w-[880px]" : "sm:max-w-[500px]"
        } max-h-[88vh] sm:max-h-screen sm:h-full rounded-t-2xl sm:rounded-none sm:rounded-l-2xl border-t sm:border-t-0 sm:border-l border-slate-200 bg-[#F4F9F6] text-slate-800 flex flex-col overflow-hidden shadow-2xl transition-all duration-200`}
      >
        <div className="px-6 py-4 bg-white border-b border-slate-100 flex items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-semibold text-[#14532D]">
              District Forecast Details · +{leadTime}h Window
            </span>
            <h2 className="text-base font-bold text-slate-900">
              {compareForecast
                ? `${forecast.district.name} vs ${compareForecast.district.name}`
                : forecast.district.name}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close district detail panel"
            className="p-2 rounded-xl bg-slate-100 hover:bg-[#14532D] text-slate-600 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {compareForecast && (
          <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#14532D]">
              Compare with district:
            </span>
            <select
              value={compareDistrictName || ""}
              onChange={(e) => setCompareDistrictName(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 font-semibold text-xs"
            >
              {allForecasts
                .filter((f) => f.district.name !== forecast.district.name)
                .map((f) => (
                  <option key={f.district.name} value={f.district.name}>
                    #{f.rank} {f.district.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div
            className={`grid gap-6 ${
              compareForecast ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
            }`}
          >
            <SingleDistrictColumn
              forecast={forecast}
              bestAnalog={bestAnalog}
              leadTime={leadTime}
              isTechnicalRole={isTechnicalRole}
              onJumpToAnalogs={() => {
                onClose();
                onJumpToAnalogs();
              }}
            />

            {compareForecast && (
              <SingleDistrictColumn
                forecast={compareForecast}
                leadTime={leadTime}
                isTechnicalRole={isTechnicalRole}
                onJumpToAnalogs={() => {
                  onClose();
                  onJumpToAnalogs();
                }}
              />
            )}
          </div>
        </div>

        <div className="px-6 py-4 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleToggleCompare}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-[#ECFDF5] text-slate-700 text-xs font-semibold transition"
          >
            <GitCompare className="w-3.5 h-3.5 text-[#14532D]" />
            <span>
              {compareForecast
                ? "Exit Comparison"
                : "Compare with another district"}
            </span>
          </button>

          {isTechnicalRole && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onJumpToInsights();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#14532D] hover:bg-[#052E16] text-white text-xs font-semibold shadow-sm transition"
            >
              <span>View Model Insights</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
