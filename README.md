# FOREXA — Forecast Intelligence (SIH26081)
**Adaptive & Explainable Hybrid AI–NWP Weather Forecast Dashboard for Kerala (14 Districts)**

---

## 1. Tech Stack & Why It Was Chosen
- **React 18 + TypeScript + Vite + Tailwind CSS**: Provides instant `<200ms` state transitions across all tabs (`#forecast`, `#insights`, `#control`) without page reloads, strict type safety for adaptive weight redistribution, and responsive desktop/mobile layouts (right drawer on desktop, bottom sheet on mobile).
- **Leaflet 1.9.4 + OpenStreetMap Tiles + Kerala District GeoJSON**: Renders a real interactive map locked to Kerala's geographic bounds (`8.15°N–12.85°N, 74.75°E–77.45°E`) with 14 district polygons, pulsing Red-alert outlines, steady Orange-alert borders, centroid event icons, and an interactive Arabian Sea cyclone track/cone overlay.
- **Custom High-Precision Interactive SVG Charts**: Zero-bloat vector charts supporting shaded ensemble uncertainty bands, clickable model curve toggles (`NWP`, `AI`, `Ensemble`), severity threshold lines (`Yellow`, `Orange`, `Red`), dynamic slider vertical markers, and historical analog curve overlays.
- **Firebase Auth + Cloud Firestore + FastAPI Backend**: Supports institutional authentication (`/login`) and Control Room admin privileges.

---

## 2. How to Run

### Option A: Full Stack (FastAPI + Production React Bundle on Port 8000)
```powershell
$env:PYTHONPATH="backend"
backend\.venv\Scripts\uvicorn forexa.api:app --host 0.0.0.0 --port 8000
```
- **Main Dashboard (`Forecast Intelligence`)**: `http://localhost:8000/`
- **Admin / Institutional Login Portal**: `http://localhost:8000/login`

### Option B: Frontend Vite Dev Server (Hot Reload on Port 5173)
```powershell
cd frontend
npm run dev
```
- Open `http://localhost:5173/`

---

## 3. Data Architecture & How to Plug In Real Data

All illustrative data is cleanly separated into three JSON files under [`frontend/src/data/`](file:///c:/Users/Neha%20T%20Biju/OneDrive/Desktop/Forexa/frontend/src/data/):

1. **[`districts.json`](file:///c:/Users/Neha%20T%20Biju/OneDrive/Desktop/Forexa/frontend/src/data/districts.json)**:
   - Contains the 14 Kerala district metadata (`id`, `name`, `terrain`, `elevationM`, `majorRiverOrDam`, `centroid`, `polygon`) and `cycloneTrack` coordinates.
   - **Plug in real data**: Replace `polygon` arrays with high-resolution KSDMA / Survey of India / OpenStreetMap GeoJSON coordinates and live IMD RSMC cyclone advisory track points.

2. **[`forecasts.json`](file:///c:/Users/Neha%20T%20Biju/OneDrive/Desktop/Forexa/frontend/src/data/forecasts.json)**:
   - Contains per-district forecasts across horizons `1h, 12h, 24h, 36h, 48h, 60h, 72h`, including `weightsByHorizon` (`{ nwp, ai, ensemble }` summing to 100%, shared across all variables within a district) and `hourlySeries` (`nwp`, `ai`, `ensemble`, `spread`, `windKmh`, `gustKmh`, `tempC`, `humidityPct`).
   - **Plug in real data**: Connect to the FastAPI endpoint `/forecast/latest` or swap with live NOAA GFS / ECMWF IFS (`nwp`), GraphCast (`ai`), and WeatherNext 2 / GEFS (`ensemble`) outputs.

3. **[`historicalAnalogs.json`](file:///c:/Users/Neha%20T%20Biju/OneDrive/Desktop/Forexa/frontend/src/data/historicalAnalogs.json)**:
   - Contains historical extreme weather events across Kerala (`2007–2024`) with `peakIntensityMmH`, `accumulated24hMm`, `forecast24hMm`, `durationHours`, `season`, `terrainType`, `observedCurve` (72h profile), `recordedImpacts`, and retrospective `modelPerformance`.
   - **Plug in real data**: Ingest historical IMD gridded rainfall, ERA5 / IMERG reanalysis curves, and KSDMA post-disaster damage catalogs using the same JSON schema.
