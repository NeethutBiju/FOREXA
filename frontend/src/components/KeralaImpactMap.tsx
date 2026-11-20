import React, { useEffect, useRef, useState } from "react";
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Layers,
  Navigation,
  Sparkles,
} from "lucide-react";
import {
  ComputedDistrictForecast,
  HorizonHours,
  SEVERITY_CONFIG,
} from "../utils/forecastEngine";
import { EventIcon, SeverityChip } from "./WeatherIcons";

declare global {
  interface Window {
    L?: any;
  }
}

export type MapLayerMode = "alerts" | "rainfall" | "wind";

interface KeralaImpactMapProps {
  forecasts: ComputedDistrictForecast[];
  selectedDistrictId: string;
  hoveredDistrictId: string | null;
  analogHighlightDistrictId: string | null;
  leadTime: HorizonHours;
  darkMode: boolean;
  onSelectDistrict: (districtId: string, openDrawer?: boolean) => void;
  onHoverDistrict: (districtId: string | null) => void;
  onResetSelection: () => void;
}

const KERALA_CENTER: [number, number] = [10.52, 76.28];
const KERALA_DEFAULT_ZOOM = 7;
const KERALA_MAX_BOUNDS: [[number, number], [number, number]] = [
  [7.85, 74.2],
  [13.15, 78.1],
];

export const KeralaImpactMap: React.FC<KeralaImpactMapProps> = ({
  forecasts,
  selectedDistrictId,
  hoveredDistrictId,
  analogHighlightDistrictId,
  onSelectDistrict,
  onHoverDistrict,
  onResetSelection,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const polygonsMapRef = useRef<Record<string, any>>({});

  const [activeLayer, setActiveLayer] = useState<MapLayerMode>("alerts");
  const [leafletReady, setLeafletReady] = useState<boolean>(() =>
    Boolean(typeof window !== "undefined" && window.L)
  );

  const selectedForecast =
    forecasts.find(
      (f) =>
        f.district.id.toLowerCase() === selectedDistrictId.toLowerCase() ||
        f.district.name.toLowerCase() === selectedDistrictId.toLowerCase()
    ) || forecasts[0];

  useEffect(() => {
    if (window.L) {
      setLeafletReady(true);
      return;
    }
    const timer = setInterval(() => {
      if (window.L) {
        setLeafletReady(true);
        clearInterval(timer);
      }
    }, 150);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current || mapInstanceRef.current) {
      return;
    }
    const L = window.L;
    const map = L.map(mapContainerRef.current, {
      center: KERALA_CENTER,
      zoom: KERALA_DEFAULT_ZOOM,
      minZoom: 6,
      maxZoom: 11,
      maxBounds: KERALA_MAX_BOUNDS,
      maxBoundsViscosity: 0.85,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      opacity: 0.88,
    }).addTo(map);

    map.on("click", () => {
      map.flyTo(KERALA_CENTER, KERALA_DEFAULT_ZOOM, { duration: 0.45 });
    });

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [leafletReady]);

  useEffect(() => {
    if (!leafletReady || !mapInstanceRef.current || !layerGroupRef.current) {
      return;
    }
    const L = window.L;
    const group = layerGroupRef.current;
    group.clearLayers();
    polygonsMapRef.current = {};

    forecasts.forEach((item) => {
      const dist = item.district;
      if (!dist.polygon || dist.polygon.length === 0) return;

      const isSelected =
        dist.id.toLowerCase() === selectedDistrictId.toLowerCase() ||
        dist.name.toLowerCase() === selectedDistrictId.toLowerCase();
      const isHovered =
        hoveredDistrictId &&
        (dist.id.toLowerCase() === hoveredDistrictId.toLowerCase() ||
          dist.name.toLowerCase() === hoveredDistrictId.toLowerCase());
      const isAnalogHighlighted =
        analogHighlightDistrictId &&
        (dist.id.toLowerCase() === analogHighlightDistrictId.toLowerCase() ||
          dist.name.toLowerCase() === analogHighlightDistrictId.toLowerCase());

      const sevMeta = SEVERITY_CONFIG[item.severity];
      const hasFeed = item.hasNativeStation && item.status !== "UNAVAILABLE";

      // Unified Violet monochrome shading
      let fillColor = !hasFeed ? "#E2E8F0" : sevMeta.fillHex;
      if (hasFeed && activeLayer === "rainfall") {
        const mm = item.rain6hMm || 0;
        fillColor =
          mm >= 50
            ? "#4C1D95"
            : mm >= 35
            ? "#6D28D9"
            : mm >= 15
            ? "#8B5CF6"
            : "#C4B5FD";
      } else if (hasFeed && activeLayer === "wind") {
        const wMs = item.currentPoint.windMs || 0;
        fillColor =
          wMs >= 16.5
            ? "#4C1D95"
            : wMs >= 13.0
            ? "#6D28D9"
            : wMs >= 9.0
            ? "#8B5CF6"
            : "#C4B5FD";
      }

      const strokeColor = isSelected
        ? "#4C1D95"
        : isAnalogHighlighted || isHovered
        ? "#6D28D9"
        : !hasFeed
        ? "#CBD5E1"
        : "#7C3AED";

      const strokeWeight = isSelected
        ? 3.8
        : isHovered || isAnalogHighlighted
        ? 3.0
        : 1.5;

      const fillOpacity = !hasFeed
        ? 0.3
        : isSelected
        ? 0.65
        : isHovered
        ? 0.55
        : item.severity === "RED"
        ? 0.52
        : item.severity === "ORANGE"
        ? 0.42
        : 0.28;

      const polygon = L.polygon(dist.polygon, {
        color: strokeColor,
        weight: strokeWeight,
        fillColor,
        fillOpacity,
        dashArray: !hasFeed ? "4 4" : undefined,
      });

      const layerMetricText = !item.hasNativeStation
        ? "No station coverage in dataset"
        : item.status === "UNAVAILABLE"
        ? "All 3 forecast sources offline"
        : activeLayer === "rainfall"
        ? `6h Rain: ${item.rain6hMm ?? "—"} mm (${item.rainRateMmH ?? "—"} mm/h)`
        : activeLayer === "wind"
        ? `Wind: ${item.currentPoint.windMs ?? "—"} m/s (${item.currentPoint.windKmh ?? "—"} km/h)`
        : `${item.eventType} · +${item.leadTimeHours}h lead`;

      polygon.bindTooltip(
        `<div style="min-width:175px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px;">
            <strong style="font-size:12px;color:#fff;">#${item.rank} ${dist.name}</strong>
            <span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;background:#6D28D9;color:#fff;">
              ${!item.hasNativeStation ? "Unmonitored" : sevMeta.shortLabel}
            </span>
          </div>
          <div style="font-size:11px;color:#EDE9FE;font-weight:500;">${layerMetricText}</div>
          <div style="font-size:10px;color:#C4B5FD;margin-top:2px;">Weights: NWP ${item.weights.nwp}% · AI ${item.weights.ai}% · Ens ${item.weights.ensemble}%</div>
        </div>`,
        {
          sticky: true,
          direction: "top",
          className: "kerala-map-tooltip",
        }
      );

      polygon.on("mouseover", () => {
        onHoverDistrict(dist.name);
      });
      polygon.on("mouseout", () => {
        onHoverDistrict(null);
      });
      polygon.on("click", (e: any) => {
        if (e?.originalEvent) {
          e.originalEvent.stopPropagation();
        }
        onSelectDistrict(dist.name, true);
      });

      polygon.addTo(group);
      polygonsMapRef.current[dist.name.toLowerCase()] = polygon;
      polygonsMapRef.current[dist.id.toLowerCase()] = polygon;

      if (isAnalogHighlighted) {
        L.circleMarker(dist.centroid, {
          radius: 16,
          color: "#6D28D9",
          weight: 2.5,
          dashArray: "4 3",
          fillColor: "#8B5CF6",
          fillOpacity: 0.18,
        }).addTo(group);
      }

      const labelHtml = `
        <div style="
          display:inline-flex;
          align-items:center;
          padding:2px 8px;
          border-radius:999px;
          font-size:10px;
          font-weight:600;
          white-space:nowrap;
          background:${isSelected ? "#6D28D9" : "rgba(255,255,255,0.95)"};
          color:${isSelected ? "#FFFFFF" : "#1E293B"};
          border:1px solid ${isSelected ? "#4C1D95" : "#DDD6FE"};
          box-shadow:0 2px 6px rgba(15,23,42,0.08);
          transform:translate(-50%, -50%);
          pointer-events:none;
        ">
          <span>${dist.name}</span>
        </div>
      `;

      const labelMarker = L.marker(dist.centroid, {
        interactive: false,
        icon: L.divIcon({
          className: "",
          html: labelHtml,
          iconSize: [0, 0],
        }),
      });
      labelMarker.addTo(group);
    });
  }, [
    leafletReady,
    forecasts,
    selectedDistrictId,
    hoveredDistrictId,
    analogHighlightDistrictId,
    activeLayer,
  ]);

  const zoomToDistrict = (districtKey: string) => {
    const poly = polygonsMapRef.current[districtKey.toLowerCase()];
    if (!mapInstanceRef.current || !poly) return;
    mapInstanceRef.current.flyToBounds(poly.getBounds(), {
      padding: [45, 45],
      maxZoom: 8.8,
      duration: 0.5,
    });
  };

  const handleResetMap = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(KERALA_CENTER, KERALA_DEFAULT_ZOOM, {
        duration: 0.45,
      });
    }
    onResetSelection();
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-[#6D28D9]">
              Kerala Impact Map
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#F5F3FF] text-[#6D28D9]">
              <Navigation className="w-3 h-3" />
              14 Districts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Select any district polygon to view detailed forecast metrics
          </p>
        </div>

        <div
          className="inline-flex items-center p-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold"
          role="group"
          aria-label="Map layer toggle"
        >
          <Layers className="w-3.5 h-3.5 text-[#6D28D9] mx-2" />
          {(
            [
              { id: "alerts", label: "Intensity" },
              { id: "rainfall", label: "Rainfall" },
              { id: "wind", label: "Wind" },
            ] as { id: MapLayerMode; label: string }[]
          ).map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => setActiveLayer(layer.id)}
              className={`px-3 py-1.5 rounded-lg transition-all duration-150 ${
                activeLayer === layer.id
                  ? "bg-[#6D28D9] text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full h-[480px] sm:h-[520px] bg-[#FAFAFE]">
        <div
          ref={mapContainerRef}
          className="w-full h-full z-10"
          aria-label="Interactive Kerala 14-district impact map"
        />

        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleResetMap}
            title="Reset view to full Kerala"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-[#F5F3FF] text-slate-700 border border-slate-200 shadow-sm text-xs font-semibold transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#6D28D9]" />
            <span>Reset View</span>
          </button>

          <div className="flex flex-col self-end bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => mapInstanceRef.current?.zoomIn()}
              aria-label="Zoom in"
              className="p-2.5 hover:bg-[#F5F3FF] text-slate-700 border-b border-slate-100 transition"
            >
              <ZoomIn className="w-4 h-4 text-[#6D28D9]" />
            </button>
            <button
              type="button"
              onClick={() => mapInstanceRef.current?.zoomOut()}
              aria-label="Zoom out"
              className="p-2.5 hover:bg-[#F5F3FF] text-slate-700 transition"
            >
              <ZoomOut className="w-4 h-4 text-[#6D28D9]" />
            </button>
          </div>
        </div>

        {selectedForecast && (
          <div className="absolute top-4 left-4 z-20">
            <button
              type="button"
              onClick={() => zoomToDistrict(selectedForecast.district.name)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#F5F3FF] text-slate-800 text-xs font-semibold shadow-sm border border-slate-200 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Focus {selectedForecast.district.name}</span>
            </button>
          </div>
        )}

        <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-sm px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#6D28D9] mb-1.5">
            Forecast Intensity Scale
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4C1D95] inline-block" />
              Critical
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#6D28D9] inline-block" />
              High
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#A78BFA] inline-block" />
              Moderate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#DDD6FE] inline-block" />
              Normal
            </span>
          </div>
        </div>
      </div>

      {selectedForecast && (
        <div className="px-6 py-4 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#F5F3FF] text-[#6D28D9]">
              Selected
            </span>
            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
              <EventIcon
                type={selectedForecast.iconType}
                className="w-4 h-4 text-[#6D28D9]"
              />
              <span>
                {selectedForecast.district.name} ·{" "}
                {selectedForecast.conditionTitle}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SeverityChip severity={selectedForecast.severity} size="xs" />
            <button
              type="button"
              onClick={() =>
                onSelectDistrict(selectedForecast.district.name, true)
              }
              className="text-xs font-semibold text-[#6D28D9] hover:text-[#4C1D95] underline"
            >
              Open Details →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
