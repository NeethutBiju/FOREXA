"""Central configuration for FOREXA (paths, 14 Kerala districts, sources, variables, valid ranges, splits)."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(os.environ.get("FOREXA_ROOT", Path(__file__).resolve().parents[2]))
DATA_DIR = Path(os.environ.get("FOREXA_DATA_DIR", ROOT / "data"))
RAW_DIR = DATA_DIR / "raw"            # original uploads, never modified
PROCESSED_DIR = DATA_DIR / "processed"
ARTIFACT_DIR = DATA_DIR / "artifacts"
DB_PATH = DATA_DIR / "forexa.duckdb"

STORAGE_BACKEND = os.environ.get("FOREXA_STORAGE", "local")  # local | gcp
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")
GCP_REGION = os.environ.get("GCP_REGION", "asia-south1")
GCS_BUCKET = os.environ.get("FOREXA_GCS_BUCKET", "forexa-kerala-data")
BQ_DATASET = os.environ.get("FOREXA_BQ_DATASET", "forexa_kerala")

# --- All 14 Kerala districts with geographic metadata ------------------------
DISTRICT_METADATA = {
    "Thiruvananthapuram": {"code": "KL-TVM", "lat": 8.5241, "lon": 76.9366, "elev_m": 10, "zone": "Southern Coastal", "has_native_station": True},
    "Kollam":             {"code": "KL-KLM", "lat": 8.8932, "lon": 76.6141, "elev_m": 14, "zone": "Southern Coastal", "has_native_station": False},
    "Pathanamthitta":     {"code": "KL-PTA", "lat": 9.2648, "lon": 76.7870, "elev_m": 31, "zone": "Southern Midland", "has_native_station": False},
    "Alappuzha":          {"code": "KL-ALP", "lat": 9.4981, "lon": 76.3388, "elev_m": 3,  "zone": "Backwater Coastal", "has_native_station": True},
    "Kottayam":           {"code": "KL-KTM", "lat": 9.5916, "lon": 76.5222, "elev_m": 12, "zone": "Central Midland", "has_native_station": False},
    "Idukki":             {"code": "KL-IDK", "lat": 10.0889, "lon": 77.0595, "elev_m": 1532, "zone": "High Range Ghats", "has_native_station": True},
    "Ernakulam":          {"code": "KL-EKM", "lat": 9.9312, "lon": 76.2673, "elev_m": 4,  "zone": "Central Coastal", "has_native_station": True},
    "Thrissur":           {"code": "KL-TSR", "lat": 10.5276, "lon": 76.2144, "elev_m": 18, "zone": "Central Midland", "has_native_station": True},
    "Palakkad":           {"code": "KL-PKD", "lat": 10.7867, "lon": 76.6548, "elev_m": 84, "zone": "Palakkad Gap Midland", "has_native_station": True},
    "Malappuram":         {"code": "KL-MLP", "lat": 11.0510, "lon": 76.0711, "elev_m": 40, "zone": "Northern Midland", "has_native_station": False},
    "Kozhikode":          {"code": "KL-KKD", "lat": 11.2588, "lon": 75.7804, "elev_m": 8,  "zone": "Northern Coastal", "has_native_station": True},
    "Wayanad":            {"code": "KL-WYD", "lat": 11.6103, "lon": 76.0827, "elev_m": 780, "zone": "Northern High Range", "has_native_station": True},
    "Kannur":             {"code": "KL-KNR", "lat": 11.8745, "lon": 75.3704, "elev_m": 11, "zone": "Northern Coastal", "has_native_station": False},
    "Kasaragod":          {"code": "KL-KSD", "lat": 12.4996, "lon": 74.9869, "elev_m": 19, "zone": "Northern Coastal", "has_native_station": False},
}
DISTRICTS = list(DISTRICT_METADATA.keys())
NATIVE_DISTRICTS = [d for d, m in DISTRICT_METADATA.items() if m["has_native_station"]]
UNMONITORED_DISTRICTS = [d for d, m in DISTRICT_METADATA.items() if not m["has_native_station"]]

# Dataset station/location name -> official Kerala district
LOCATION_TO_DISTRICT = {
    "Thiruvananthapuram": "Thiruvananthapuram",
    "Kollam": "Kollam",
    "Pathanamthitta": "Pathanamthitta",
    "Alappuzha": "Alappuzha",
    "Kottayam": "Kottayam",
    "Idukki": "Idukki",
    "Munnar": "Idukki",
    "Ernakulam": "Ernakulam",
    "Kochi": "Ernakulam",
    "Thrissur": "Thrissur",
    "Palakkad": "Palakkad",
    "Malappuram": "Malappuram",
    "Kozhikode": "Kozhikode",
    "Wayanad": "Wayanad",
    "Kannur": "Kannur",
    "Kasaragod": "Kasaragod",
}

# --- Forecast sources ---------------------------------------------------------
SOURCES = {
    "nwp": {"label": "NWP (GFS-like, synthetic)", "file_hint": "gfs"},
    "ensemble": {"label": "Ensemble (WeatherNext2-like, synthetic)", "file_hint": "weathernext"},
    "ai": {"label": "AI (GraphCast-like, synthetic)", "file_hint": "graphcast"},
}
MODEL_KEYS = list(SOURCES)

# Core 5 variables present across all bundled forecast & observation files
VARIABLES = ["temp_c", "precip_6h_mm", "humidity_pct", "wind_ms", "pressure_hpa"]
# All 8 specification weather variables (circular/optional variables blended when present)
ALL_8_VARIABLES = [
    "precip_6h_mm", "temp_c", "humidity_pct", "wind_ms",
    "wind_dir_deg", "wind_gust_ms", "pressure_hpa", "cloud_cover_pct",
]

# Physically plausible bounds for Kerala (QC flags only — raw values are NOT silently altered)
VALID_RANGES = {
    "temp_c": (0.0, 48.0),
    "precip_6h_mm": (0.0, 500.0),
    "humidity_pct": (0.0, 100.0),
    "wind_ms": (0.0, 70.0),
    "wind_dir_deg": (0.0, 360.0),
    "wind_gust_ms": (0.0, 100.0),
    "pressure_hpa": (940.0, 1050.0),
    "cloud_cover_pct": (0.0, 100.0),
    "temp_spread_c": (0.0, 20.0),
    "precip_spread_mm": (0.0, 300.0),
    "precip_p10_mm": (0.0, 500.0),
    "precip_p90_mm": (0.0, 800.0),
    "precip_prob_pct": (0.0, 100.0),
}

# Chronological split boundaries (strictly causal, zero random shuffling)
TRAIN_END_ISO = "2024-01-01T00:00:00Z"
VAL_END_ISO = "2025-01-01T00:00:00Z"

STANDARD_LEADS = [6, 12, 18, 24, 30, 36, 42, 48, 54, 60, 66, 72]
NATIVE_LEADS = [24, 72]
NATIVE_LEADS_NOTE = "Source datasets provide native 24 h and 72 h leads; intermediate 6 h steps are temporally interpolated display views."
