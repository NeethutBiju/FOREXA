import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture()
def tmp_env(tmp_path, monkeypatch):
    from forexa import config

    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(config, "PROCESSED_DIR", tmp_path / "processed")
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "t.duckdb")
    return tmp_path


def make_forecast(n=4):
    rows = []
    for i in range(n):
        rows.append({
            "timestamp_ist": f"2024-06-01T{6*i:02d}:00:00+05:30", "location": "Kochi",
            "lead_time_hours": 24, "weather_condition_actual": "Moderate Rain",
            "pred_condition": "Moderate Rain", "pred_temp_c": 27.0, "pred_precip_6h_mm": 12.0,
            "pred_humidity_pct": 90.0, "pred_wind_kmh": 18.0, "pred_pressure_hpa": 1006.0,
        })
    return pd.DataFrame(rows)
