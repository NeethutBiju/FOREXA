import React from "react";
import {
  CloudRain,
  Waves,
  Mountain,
  Zap,
  Wind,
  Sun,
  AlertOctagon,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Compass,
} from "lucide-react";
import {
  EventIconType,
  HourlyPoint,
  SEVERITY_CONFIG,
  SeverityLevel,
} from "../utils/forecastEngine";

export const CycloneSpiralIcon: React.FC<{ className?: string }> = ({
  className = "w-4 h-4",
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.1"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0" />
    <path d="M14.5 12c0 3.5-3 6-6.5 6c-3.8 0-6-2.8-6-6.2C2 7.2 6.2 3 12 3c4.5 0 8 2.2 9.5 5.5" />
    <path d="M9.5 12c0-3.5 3-6 6.5-6c3.8 0 6 2.8 6 6.2c0 4.6-4.2 8.8-10 8.8c-4.5 0-8-2.2-9.5-5.5" />
  </svg>
);

export const EventIcon: React.FC<{
  type: EventIconType;
  className?: string;
}> = ({ type, className = "w-4 h-4" }) => {
  switch (type) {
    case "cyclone":
      return <CycloneSpiralIcon className={className} />;
    case "heavy-rain":
      return <CloudRain className={className} />;
    case "flood":
      return <Waves className={className} />;
    case "landslide":
      return <Mountain className={className} />;
    case "thunderstorm":
      return <Zap className={className} />;
    case "wind":
      return <Wind className={className} />;
    case "storm-surge":
      return <Compass className={className} />;
    case "heatwave":
      return <Sun className={className} />;
    default:
      return <CloudRain className={className} />;
  }
};

export const SeverityIcon: React.FC<{
  severity: SeverityLevel;
  className?: string;
}> = ({ severity, className = "w-3.5 h-3.5" }) => {
  switch (severity) {
    case "RED":
      return <AlertOctagon className={className} />;
    case "ORANGE":
      return <AlertTriangle className={className} />;
    case "YELLOW":
      return <AlertCircle className={className} />;
    case "GREEN":
      return <CheckCircle2 className={className} />;
  }
};

export const SeverityChip: React.FC<{
  severity: SeverityLevel;
  fullText?: boolean;
  pulseRed?: boolean;
  size?: "xs" | "sm" | "md";
}> = ({ severity, fullText = false, size = "xs" }) => {
  const meta = SEVERITY_CONFIG[severity];
  const sizeClasses =
    size === "md"
      ? "px-3 py-1 text-xs"
      : size === "sm"
      ? "px-2.5 py-0.5 text-[11px]"
      : "px-2.5 py-0.5 text-[10px]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold border tracking-wide transition-all duration-200 ${meta.chipClass} ${sizeClasses}`}
      aria-label={`Level ${meta.label}`}
    >
      <SeverityIcon
        severity={severity}
        className={size === "md" ? "w-3.5 h-3.5" : "w-3 h-3"}
      />
      <span>{fullText ? meta.label : meta.shortLabel}</span>
    </span>
  );
};

export const MiniSparkline: React.FC<{
  series: HourlyPoint[];
  severity: SeverityLevel;
  activeHorizon: number;
}> = ({ series, activeHorizon }) => {
  const validSeries = series.filter((s) => s.blended !== null);
  if (validSeries.length === 0) {
    return (
      <span className="text-[10px] font-medium text-slate-400">No feed</span>
    );
  }
  const width = 56;
  const height = 22;
  const maxVal = Math.max(40, ...validSeries.map((s) => s.blended || 0));
  const strokeColor = "#14532D";

  const points = validSeries.map((pt, idx) => {
    const x = (idx / Math.max(1, validSeries.length - 1)) * (width - 6) + 3;
    const y = height - 3 - ((pt.blended || 0) / maxVal) * (height - 6);
    return { x, y, h: pt.h };
  });

  const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const activePt = points.find((p) => p.h === activeHorizon) || points[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible shrink-0"
      aria-label="72-hour rainfall trend sparkline"
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polyline}
      />
      {activePt && (
        <circle
          cx={activePt.x}
          cy={activePt.y}
          r="2.6"
          fill="#14532D"
          stroke="#FFFFFF"
          strokeWidth="1"
        />
      )}
    </svg>
  );
};
