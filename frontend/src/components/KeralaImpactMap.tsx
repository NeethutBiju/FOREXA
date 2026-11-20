import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Layers,
  Navigation,
  Crosshair,
} from "lucide-react";
import {
  ComputedDistrictForecast,
  HorizonHours,
  SEVERITY_CONFIG,
} from "../utils/forecastEngine";
import { SeverityChip } from "./WeatherIcons";

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
  onSelectDistrict,
  onHoverDistrict,
  onResetSelection,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const polygonsMapRef = useRef<Record<string, any>>({});

  const [activeLayer, setActiveLayer] = useState<MapLayerMode>("alerts");
  const [basemapMode, setBasemapMode] = useState<"terrain" | "satellite">(
    "terrain"
  );
  const [leafletReady, setLeafletReady] = useState<boolean>(() =>
    Boolean(typeof window !== "undefined" && window.L)
  );

  const selectedForecast =
    forecasts.find(
      (f) =>
        f.district.id.toLowerCase() === selectedDistrictId.toLowerCase() ||
        f.district.name.toLowerCase() === selectedDistrictId.toLowerCase()
    ) || forecasts[0];

  // Identify the #1 highest-priority district specifically for the active layer (Alerts vs Rainfall vs Wind)
  const topPriorityForLayer = useMemo(() => {
    const monitored = forecasts.filter(
      (f) => f.hasNativeStation && f.status !== "UNAVAILABLE"
    );
    if (monitored.length === 0) return null;
    if (activeLayer === "wind") {
      return [...monitored].sort(
        (a, b) => (b.currentPoint.windMs || 0) - (a.currentPoint.windMs || 0)
      )[0];
    }
    if (activeLayer === "rainfall") {
      return [...monitored].sort(
        (a, b) => (b.rain6hMm || 0) - (a.rain6hMm || 0)
      )[0];
    }
    return monitored[0]; // Already ranked by severity & rainfall
  }, [forecasts, activeLayer]);

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

    // Real, API-key-free Esri World Topographic / Satellite imagery basemap (never shows "API key required")
    const tileUrl =
      basemapMode === "satellite"
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
    tileLayerRef.current = L.tileLayer(tileUrl, {
      maxZoom: 18,
      opacity: 1,
    }).addTo(map);

    map.on("click", () => {
      map.flyTo(KERALA_CENTER, KERALA_DEFAULT_ZOOM, { duration: 0.45 });
    });

    layerGroupRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
    };
  }, [leafletReady]);

  // Switch between real Terrain & real Satellite basemaps smoothly without recreating the map
  useEffect(() => {
    if (!leafletReady || !mapInstanceRef.current || !window.L) return;
    const L = window.L;
    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }
    const tileUrl =
      basemapMode === "satellite"
        ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
    tileLayerRef.current = L.tileLayer(tileUrl, {
      maxZoom: 18,
      opacity: 1,
    }).addTo(mapInstanceRef.current);
    tileLayerRef.current.bringToBack();
  }, [basemapMode, leafletReady]);

  useEffect(() => {
    if (!leafletReady || !mapInstanceRef.current || !layerGroupRef.current) {
      return;
    }
    const L = window.L;
    const group = layerGroupRef.current;
    group.clearLayers();
    polygonsMapRef.current = {};

    const monitored = forecasts.filter(
      (f) => f.hasNativeStation && f.status !== "UNAVAILABLE"
    );
    const maxRain = Math.max(1, ...monitored.map((f) => f.rain6hMm || 0));
    const maxWind = Math.max(
      1,
      ...monitored.map((f) => f.currentPoint.windMs || 0)
    );

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
      const isTopLayerPriority =
        topPriorityForLayer &&
        topPriorityForLayer.district.name.toLowerCase() ===
          dist.name.toLowerCase();

      const sevMeta = SEVERITY_CONFIG[item.severity];
      const hasFeed = item.hasNativeStation && item.status !== "UNAVAILABLE";

      let fillColor = "#E2E8F0";
      let strokeColor = "#CBD5E1";
      let fillOpacity = 0.25;

      if (hasFeed) {
        if (activeLayer === "alerts") {
          const proAlertColors: Record<string, { fill: string; stroke: string; opacity: number }> = {
            RED: { fill: "#C81E1E", stroke: "#991B1B", opacity: 0.56 },
            ORANGE: { fill: "#D95D16", stroke: "#9A3412", opacity: 0.48 },
            YELLOW: { fill: "#D4A017", stroke: "#A16207", opacity: 0.40 },
            GREEN: { fill: "#1F7A4C", stroke: "#14532D", opacity: 0.30 },
          };
          const pal = proAlertColors[item.severity] || proAlertColors.GREEN;
          fillColor = pal.fill;
          strokeColor = isSelected ? "#052E16" : pal.stroke;
          fillOpacity = isSelected
            ? Math.min(0.72, pal.opacity + 0.16)
            : isHovered
            ? Math.min(0.66, pal.opacity + 0.10)
            : pal.opacity;
        } else if (activeLayer === "rainfall") {
          const ratio = (item.rain6hMm || 0) / maxRain;
          fillColor =
            ratio >= 0.8
              ? "#B91C1C"
              : ratio >= 0.55
              ? "#EA580C"
              : ratio >= 0.3
              ? "#15803D"
              : "#86EFAC";
          strokeColor = isTopLayerPriority
            ? "#991B1B"
            : isSelected
            ? "#14532D"
            : "#166534";
          fillOpacity = isTopLayerPriority ? 0.78 : isSelected ? 0.68 : 0.45;
        } else {
          // Wind mode: distinct high-contrast amber/orange/dark-emerald wind ramp
          const ratio = (item.currentPoint.windMs || 0) / maxWind;
          fillColor =
            ratio >= 0.85
              ? "#C2410C"
              : ratio >= 0.65
              ? "#F59E0B"
              : ratio >= 0.4
              ? "#0F766E"
              : "#99F6E4";
          strokeColor = isTopLayerPriority
            ? "#9A3412"
            : isSelected
            ? "#14532D"
            : "#0F766E";
          fillOpacity = isTopLayerPriority ? 0.8 : isSelected ? 0.68 : 0.46;
        }
      }

      const strokeWeight = isTopLayerPriority
        ? 3.8
        : isSelected
        ? 3.2
        : isHovered
        ? 2.6
        : 1.4;

      const polygon = L.polygon(dist.polygon, {
        color: strokeColor,
        weight: strokeWeight,
        fillColor,
        fillOpacity,
        dashArray: !hasFeed ? "4 4" : undefined,
      });

      const layerMetricText = !item.hasNativeStation
        ? "No station coverage"
        : item.status === "UNAVAILABLE"
        ? "Forecast feed temporarily unavailable"
        : activeLayer === "rainfall"
        ? `6h Rainfall: ${item.rain6hMm ?? "—"} mm (${item.rainRateMmH ?? "—"} mm/h)`
        : activeLayer === "wind"
        ? `Wind Speed: ${item.currentPoint.windMs ?? "—"} m/s (${item.currentPoint.windKmh ?? "—"} km/h)`
        : `${item.eventType} · ${item.rain6hMm ?? "—"} mm/6h`;

      polygon.bindTooltip(
        `<div style="min-width:170px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:3px;">
            <strong style="font-size:12px;color:#fff;">#${item.rank} ${dist.name}</strong>
            <span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:999px;background:${sevMeta.hex};color:#fff;">
              ${!item.hasNativeStation ? "Unmonitored" : sevMeta.shortLabel}
            </span>
          </div>
          <div style="font-size:11px;color:#ECFDF5;font-weight:500;">${layerMetricText}</div>
          ${
            isTopLayerPriority
              ? `<div style="font-size:10px;color:#FDE047;font-weight:700;margin-top:3px;">★ Highest Priority (${activeLayer.toUpperCase()})</div>`
              : ""
          }
        </div>`,
        {
          sticky: true,
          direction: "top",
          className: "kerala-map-tooltip",
        }
      );

      polygon.on("mouseover", () => onHoverDistrict(dist.name));
      polygon.on("mouseout", () => onHoverDistrict(null));
      polygon.on("click", (e: any) => {
        if (e?.originalEvent) e.originalEvent.stopPropagation();
        onSelectDistrict(dist.name, true);
      });

      polygon.addTo(group);
      polygonsMapRef.current[dist.name.toLowerCase()] = polygon;
      polygonsMapRef.current[dist.id.toLowerCase()] = polygon;

      // Highlight #1 Highest Priority District for the active layer with a clean pulsing beacon (no text clutter!)
      if (isTopLayerPriority) {
        L.circleMarker(dist.centroid, {
          radius: 13,
          color: activeLayer === "wind" ? "#C2410C" : "#DC2626",
          weight: 3,
          fillColor: activeLayer === "wind" ? "#F59E0B" : "#EF4444",
          fillOpacity: 0.35,
          interactive: false,
        }).addTo(group);
      }
    });
  }, [
    leafletReady,
    forecasts,
    selectedDistrictId,
    hoveredDistrictId,
    activeLayer,
    topPriorityForLayer,
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
            <h2 className="text-base font-bold text-[#14532D]">
              Kerala Impact Map
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#ECFDF5] text-[#15803D]">
              <Navigation className="w-3 h-3" />
              14 Districts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Hover or click any district for live alert &amp; forecast telemetry
          </p>
        </div>

        <div
          className="inline-flex items-center p-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold"
          role="group"
          aria-label="Map layer toggle"
        >
          <Layers className="w-3.5 h-3.5 text-[#15803D] mx-2" />
          {(
            [
              { id: "alerts", label: "Alerts" },
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
                  ? "bg-[#14532D] text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full h-[480px] sm:h-[520px] bg-[#F4F9F6]">
        <div
          ref={mapContainerRef}
          className="w-full h-full z-10"
          aria-label="Interactive Kerala 14-district impact map"
        />

        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
          <div className="inline-flex p-0.5 rounded-xl bg-white/95 border border-slate-200 shadow-sm text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setBasemapMode("terrain")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                basemapMode === "terrain"
                  ? "bg-[#14532D] text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Terrain
            </button>
            <button
              type="button"
              onClick={() => setBasemapMode("satellite")}
              className={`px-2.5 py-1.5 rounded-lg transition ${
                basemapMode === "satellite"
                  ? "bg-[#14532D] text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Satellite
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetMap}
            title="Reset view to full Kerala"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-[#ECFDF5] text-slate-700 border border-slate-200 shadow-sm text-xs font-semibold transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#15803D]" />
            <span>Reset View</span>
          </button>

          <div className="flex flex-col self-end bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => mapInstanceRef.current?.zoomIn()}
              aria-label="Zoom in"
              className="p-2.5 hover:bg-[#ECFDF5] text-slate-700 border-b border-slate-100 transition"
            >
              <ZoomIn className="w-4 h-4 text-[#15803D]" />
            </button>
            <button
              type="button"
              onClick={() => mapInstanceRef.current?.zoomOut()}
              aria-label="Zoom out"
              className="p-2.5 hover:bg-[#ECFDF5] text-slate-700 transition"
            >
              <ZoomOut className="w-4 h-4 text-[#15803D]" />
            </button>
          </div>
        </div>

        {/* Dynamic Highest Priority Pill for Active Layer (Alerts vs Rainfall vs Wind) */}
        {topPriorityForLayer && (
          <div className="absolute top-4 left-4 z-20">
            <button
              type="button"
              onClick={() =>
                zoomToDistrict(topPriorityForLayer.district.name)
              }
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/95 hover:bg-[#ECFDF5] text-slate-800 text-xs font-semibold shadow-sm border border-slate-200 transition"
            >
              <Crosshair
                className={`w-3.5 h-3.5 ${
                  activeLayer === "wind" ? "text-orange-600" : "text-red-600"
                }`}
              />
              <span>
                Top{" "}
                {activeLayer === "rainfall"
                  ? "Rainfall"
                  : activeLayer === "wind"
                  ? "Wind"
                  : "Alert"}
                :{" "}
                <strong className="text-[#14532D]">
                  {topPriorityForLayer.district.name}
                </strong>{" "}
                (
                {activeLayer === "wind"
                  ? `${topPriorityForLayer.currentPoint.windMs ?? "—"} m/s`
                  : `${topPriorityForLayer.rain6hMm ?? "—"} mm/6h`}
                )
              </span>
            </button>
          </div>
        )}

        {/* Dynamic Layer-Specific Legend */}
        <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-sm px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#14532D] mb-1.5">
            {activeLayer === "alerts"
              ? "Alert Severity"
              : activeLayer === "rainfall"
              ? "Rainfall Intensity (mm/6h)"
              : "Wind Speed Intensity (m/s)"}
          </div>
          {activeLayer === "alerts" ? (
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626] inline-block" />
                Red
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] inline-block" />
                Orange
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EAB308] inline-block" />
                Yellow
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A] inline-block" />
                Normal
              </span>
            </div>
          ) : activeLayer === "rainfall" ? (
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B91C1C] inline-block" />
                Peak Rain
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EA580C] inline-block" />
                Heavy
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#15803D] inline-block" />
                Moderate
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#86EFAC] inline-block" />
                Light
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#C2410C] inline-block" />
                Peak Gust
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] inline-block" />
                Strong
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0F766E] inline-block" />
                Breezy
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#99F6E4] inline-block" />
                Calm
              </span>
            </div>
          )}
        </div>
      </div>

      {selectedForecast && (
        <div className="px-6 py-4 bg-white border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-[#ECFDF5] text-[#15803D]">
              Selected
            </span>
            <span className="font-bold text-sm text-slate-800">
              {selectedForecast.district.name} ·{" "}
              {selectedForecast.conditionTitle}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <SeverityChip severity={selectedForecast.severity} size="xs" />
            <button
              type="button"
              onClick={() =>
                onSelectDistrict(selectedForecast.district.name, true)
              }
              className="text-xs font-semibold text-[#15803D] hover:text-[#14532D] underline"
            >
              Open Details →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
