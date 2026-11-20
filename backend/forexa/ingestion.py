"""Stage 1 Data Preprocessing, Quality Validation & Extreme Event Extraction Pipeline.

Rules:
* Original files are copied unmodified to data/raw/<source_type>/.
* Timestamps are parsed to timezone-aware UTC (`valid_time`, `init_time`) and IST (`valid_time_ist`).
* Locations are mapped to canonical Kerala districts (`district`, `district_id`).
* Weather units are standardized (`km/h -> m/s` for wind speed / gust).
* Invalid or missing values are FLAGGED (`qc_flag` column), never silently overwritten.
* Columns that carry observed truth inside forecast files (`weather_condition_actual`) are dropped.
* Each record is assigned a deterministic chronological split (`train` / `val` / `test`) by `init_time` (for forecasts) or `valid_time` (for observations).
* Historical extreme weather events are automatically identified, tagged, and cataloged into `extreme_events_catalog.parquet`.
"""
from __future__ import annotations

import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from . import config, storage

SOURCE_TYPES = ["nwp", "ensemble", "ai", "observations", "historical"]
FORECAST_TYPES = {"nwp", "ensemble", "ai"}

EXTREME_EVENT_TYPES = [
    "NORMAL_WEATHER",
    "HEAVY_MONSOON_SURGE",
    "THUNDERSTORM_SQUALL",
    "HIGH_WIND_CYCLONIC",
    "EXTREME_RAINFALL",
]
EXTREME_EVENT_CODE = {e: i for i, e in enumerate(EXTREME_EVENT_TYPES)}

RENAME = {
    "pred_temp_c": "temp_c", "obs_temp_c": "temp_c",
    "pred_precip_6h_mm": "precip_6h_mm", "obs_precip_6h_mm": "precip_6h_mm",
    "pred_humidity_pct": "humidity_pct", "obs_humidity_pct": "humidity_pct",
    "pred_pressure_hpa": "pressure_hpa", "obs_pressure_hpa": "pressure_hpa",
    "obs_cloud_cover_pct": "cloud_cover_pct", "pred_cloud_cover_pct": "cloud_cover_pct",
    "pred_wind_dir_deg": "wind_dir_deg", "obs_wind_dir_deg": "wind_dir_deg",
    "pred_condition": "condition", "weather_condition": "condition",
    "lead_time_hours": "lead_h", "timestamp_ist": "valid_time",
}
LEAKAGE_COLUMNS = ["weather_condition_actual"]
REQUIRED = {
    "forecast": ["valid_time", "location", "lead_h", "temp_c", "precip_6h_mm",
                 "humidity_pct", "wind_ms", "pressure_hpa"],
    "obs": ["valid_time", "location", "temp_c", "precip_6h_mm", "humidity_pct",
            "wind_ms", "pressure_hpa"],
}
KEEP_EXTRA = [
    "season", "climate_zone", "latitude", "longitude", "elevation_m", "condition",
    "cloud_cover_pct", "wind_dir_deg", "wind_gust_ms",
    "temp_spread_c", "precip_spread_mm", "precip_p10_mm", "precip_p90_mm", "precip_prob_pct",
]


class IngestionError(ValueError):
    pass


def read_any(path: Path) -> pd.DataFrame:
    suf = path.suffix.lower()
    if suf == ".csv":
        return pd.read_csv(path)
    if suf in (".parquet", ".pq"):
        return pd.read_parquet(path)
    if suf in (".nc", ".nc4", ".netcdf", ".grib2", ".grb2", ".grib", ".h5", ".hdf5"):
        import xarray as xr

        engine = "cfgrib" if "gr" in suf else None
        ds = xr.open_dataset(path, engine=engine)
        return ds.to_dataframe().reset_index()
    raise IngestionError(f"Unsupported file type: {suf}")


def assign_chronological_split(ts: pd.Series) -> pd.Series:
    """Strictly chronological split: <2024 train, 2024 val, >=2025 test."""
    t_train = pd.Timestamp(config.TRAIN_END_ISO)
    t_val = pd.Timestamp(config.VAL_END_ISO)
    return pd.Series(
        np.select([ts < t_train, ts < t_val], ["train", "val"], default="test"),
        index=ts.index,
    )


def classify_event_signature(
    precip_6h_mm: pd.Series,
    wind_ms: pd.Series,
    pressure_hpa: pd.Series,
    condition: pd.Series | None = None,
) -> pd.Series:
    """Classify any observation or forecast row into one of the 5 canonical extreme event classes."""
    p = precip_6h_mm.fillna(0.0)
    w = wind_ms.fillna(0.0)
    pr = pressure_hpa.fillna(1010.0)
    cond = condition.fillna("").astype(str) if condition is not None else pd.Series("", index=p.index)

    is_extreme_rain = (p >= 50.0) | (cond == "Extreme Convective Rain")
    is_cyclonic = ((w >= 11.5) & (pr <= 1002.5)) | ((p >= 35.0) & (w >= 12.0) & (pr <= 1003.0))
    is_squall = (cond == "Thunderstorm / Squall") | ((p >= 15.0) & (w >= 9.5))
    is_heavy_monsoon = (p >= 20.0) | (cond == "Heavy Monsoon Rain")

    return pd.Series(
        np.select(
            [is_extreme_rain, is_cyclonic, is_squall, is_heavy_monsoon],
            [
                "EXTREME_RAINFALL",
                "HIGH_WIND_CYCLONIC",
                "THUNDERSTORM_SQUALL",
                "HEAVY_MONSOON_SURGE",
            ],
            default="NORMAL_WEATHER",
        ),
        index=p.index,
    )


def extract_extreme_events(obs_df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Automatically identify and extract historical extreme weather events during preprocessing."""
    df = obs_df.copy()
    df["event_type"] = classify_event_signature(
        df["precip_6h_mm"], df["wind_ms"], df["pressure_hpa"], df.get("condition")
    )
    df["is_extreme"] = df["event_type"] != "NORMAL_WEATHER"
    catalog = df[df["is_extreme"]].sort_values(["valid_time", "district"]).reset_index(drop=True)
    storage.write_table("extreme_events_catalog", catalog)

    by_type = {k: int(v) for k, v in df["event_type"].value_counts().items()}
    by_dist_type = (
        catalog.groupby(["district", "event_type"])
        .size()
        .unstack(fill_value=0)
        .to_dict("index")
        if len(catalog) else {}
    )
    summary = {
        "total_observations": int(len(df)),
        "total_extreme_events": int(len(catalog)),
        "extreme_event_rate_pct": round(100.0 * len(catalog) / max(len(df), 1), 2),
        "counts_by_event_type": by_type,
        "counts_by_district_and_type": by_dist_type,
    }
    storage.put_kv("extreme_events_summary", summary)
    return df, summary


def normalise(df: pd.DataFrame, source_type: str) -> tuple[pd.DataFrame, list[str]]:
    notes: list[str] = []
    df = df.reset_index(drop=True).copy()
    dropped = [c for c in LEAKAGE_COLUMNS if c in df.columns]
    if dropped and source_type in FORECAST_TYPES:
        df = df.drop(columns=dropped)
        notes.append(f"Dropped target-leakage columns: {dropped}")
    df = df.rename(columns={k: v for k, v in RENAME.items() if k in df.columns})

    # Unit standardisation: wind speed & wind gust km/h -> m/s
    for raw in ("pred_wind_kmh", "obs_wind_kmh", "wind_kmh"):
        if raw in df.columns:
            df["wind_ms"] = (pd.to_numeric(df.pop(raw), errors="coerce") / 3.6).round(2)
            notes.append(f"Converted {raw} (km/h) -> wind_ms (m/s)")
    for raw in ("pred_wind_gust_kmh", "obs_wind_gust_kmh", "wind_gust_kmh"):
        if raw in df.columns:
            df["wind_gust_ms"] = (pd.to_numeric(df.pop(raw), errors="coerce") / 3.6).round(2)
            notes.append(f"Converted {raw} (km/h) -> wind_gust_ms (m/s)")

    kind = "forecast" if source_type in FORECAST_TYPES else "obs"
    missing = [c for c in REQUIRED[kind] if c not in df.columns]
    if missing:
        raise IngestionError(f"Missing required columns for {source_type}: {missing}")

    df["valid_time"] = pd.to_datetime(df["valid_time"], utc=True, errors="coerce")
    df["valid_time_ist"] = df["valid_time"].dt.tz_convert("Asia/Kolkata").dt.strftime("%Y-%m-%dT%H:%M:%S+05:30")
    df["district"] = df["location"].map(config.LOCATION_TO_DISTRICT)
    df["district_id"] = df["district"].map(lambda d: config.DISTRICT_METADATA.get(d, {}).get("code"))

    for opt_var in ("wind_dir_deg", "wind_gust_ms", "cloud_cover_pct"):
        if opt_var not in df.columns:
            df[opt_var] = np.nan

    if kind == "forecast":
        df["lead_h"] = pd.to_numeric(df["lead_h"], errors="coerce").astype("Int64")
        df["init_time"] = df["valid_time"] - pd.to_timedelta(df["lead_h"].astype(float), unit="h")
        df["split"] = assign_chronological_split(df["init_time"])
        df["pred_event_type"] = classify_event_signature(
            df["precip_6h_mm"], df["wind_ms"], df["pressure_hpa"], df.get("condition")
        )
    else:
        df["split"] = assign_chronological_split(df["valid_time"])
        df["event_type"] = classify_event_signature(
            df["precip_6h_mm"], df["wind_ms"], df["pressure_hpa"], df.get("condition")
        )

    base = ["valid_time", "valid_time_ist", "district", "district_id", "location"] + (
        ["init_time", "lead_h", "pred_event_type"] if kind == "forecast" else ["event_type"]
    ) + ["split"]
    extra = [c for c in KEEP_EXTRA if c in df.columns and c not in config.VARIABLES]
    cols = base + config.VARIABLES + extra
    out = df[cols].copy()
    out["source_type"] = source_type
    out["is_synthetic"] = True
    return out, notes


def quality_check(df: pd.DataFrame, source_type: str) -> tuple[pd.DataFrame, dict]:
    kind = "forecast" if source_type in FORECAST_TYPES else "obs"
    key = ["valid_time", "location"] + (["lead_h"] if kind == "forecast" else [])
    flags = pd.Series("", index=df.index, dtype=object)

    def add(mask, label):
        nonlocal flags
        flags = flags.where(~mask, flags + label + ";")

    report: dict = {"n_rows": int(len(df)), "source_type": source_type}
    report["missing_values"] = {c: int(df[c].isna().sum()) for c in config.VARIABLES if df[c].isna().sum() > 0}
    report["optional_variables_present"] = {
        c: bool(c in df.columns and df[c].notna().any())
        for c in ("wind_dir_deg", "wind_gust_ms", "cloud_cover_pct")
    }
    add(df[config.VARIABLES].isna().any(axis=1), "missing")

    dup = df.duplicated(subset=key, keep="first")
    report["duplicates"] = int(dup.sum())
    add(dup, "duplicate")

    bad_time = df["valid_time"].isna()
    report["invalid_timestamps"] = int(bad_time.sum())
    add(bad_time, "bad_time")

    unknown = df["district"].isna()
    report["unknown_locations"] = sorted(df.loc[unknown, "location"].astype(str).unique().tolist())
    add(unknown, "unknown_location")

    oor = {}
    for col, (lo, hi) in config.VALID_RANGES.items():
        if col in df.columns and df[col].notna().any():
            m = df[col].notna() & ((df[col] < lo) | (df[col] > hi))
            if m.any():
                oor[col] = int(m.sum())
                add(m, f"range_{col}")
    report["out_of_range"] = oor

    if "precip_p10_mm" in df.columns and "precip_p90_mm" in df.columns:
        m = df["precip_p10_mm"] > df["precip_p90_mm"]
        report["inconsistent_percentiles"] = int(m.sum())
        add(m, "p10_gt_p90")

    vt = df["valid_time"].dropna()
    report["time_coverage"] = {"start": str(vt.min()), "end": str(vt.max())} if len(vt) else {}
    report["districts_present"] = sorted(df["district"].dropna().unique().tolist())
    report["districts_missing"] = [d for d in config.DISTRICTS if d not in report["districts_present"]]
    report["split_counts"] = {k: int(v) for k, v in df["split"].value_counts().items()}
    ev_col = "pred_event_type" if kind == "forecast" else "event_type"
    if ev_col in df.columns:
        report["extreme_event_distribution"] = {k: int(v) for k, v in df[ev_col].value_counts().items()}
    if kind == "forecast" and len(vt):
        report["lead_times"] = sorted(int(x) for x in df["lead_h"].dropna().unique())
        expected = pd.date_range(vt.min(), vt.max(), freq="6h")
        have = df["init_time"].dropna().unique()
        report["init_cycles"] = int(len(have))
    else:
        expected = pd.date_range(vt.min(), vt.max(), freq="6h") if len(vt) else []
    present = set(vt.unique())
    report["missing_6h_timesteps"] = int(sum(1 for t in expected if t not in present))

    df = df.assign(qc_flag=flags.str.rstrip(";"))
    n_flag = int((df["qc_flag"] != "").sum())
    report["flagged_rows"] = n_flag
    report["clean_rows"] = int(len(df) - n_flag)
    report["status"] = "PASSED" if n_flag == 0 else ("WARN" if n_flag / max(len(df), 1) < 0.05 else "FAILED_QC")
    return df, report


def ingest_file(path: str | Path, source_type: str, uploaded_by: str = "system",
                original_name: str | None = None) -> dict:
    if source_type not in SOURCE_TYPES:
        raise IngestionError(f"source_type must be one of {SOURCE_TYPES}")
    path = Path(path)
    run_id = uuid.uuid4().hex[:12]
    name = original_name or path.name
    created = datetime.now(timezone.utc)

    raw_dir = config.RAW_DIR / source_type
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_dest = raw_dir / f"{run_id}_{name}"
    shutil.copy2(path, raw_dest)

    row = dict(run_id=run_id, file_name=name, source_type=source_type, raw_uri=str(raw_dest),
               processed_uri=None, size_bytes=raw_dest.stat().st_size, n_rows=0,
               status="PROCESSING", qc_report={}, uploaded_by=uploaded_by, created_at=created)
    try:
        df = read_any(raw_dest)
        df, notes = normalise(df, source_type)
        df, report = quality_check(df, source_type)
        if source_type == "observations":
            df, ext_summary = extract_extreme_events(df[df["qc_flag"] == ""])
            report["extreme_events_catalog_summary"] = ext_summary
        report["transform_notes"] = notes
        report["provenance"] = {"file": name, "run_id": run_id, "uploaded_by": uploaded_by,
                                "ingested_at": created.isoformat(), "synthetic": True}
        df["ingest_run_id"] = run_id
        row.update(processed_uri=storage.write_table(source_type, df), n_rows=len(df),
                   status=report["status"], qc_report=report)
    except Exception as e:
        row.update(status="ERROR", qc_report={"error": str(e)})
    storage.record_run(row)
    return row


def bootstrap_from_raw(force: bool = False) -> list[dict]:
    """Ingest the bundled datasets in data/raw (top-level) and write data_quality_report.json."""
    mapping = {"gfs": "nwp", "weathernext": "ensemble", "graphcast": "ai", "observ": "observations"}
    results = []
    for f in sorted(config.RAW_DIR.glob("*.csv")):
        st = next((v for k, v in mapping.items() if k in f.name.lower()), None)
        if st and (force or storage.read_table(st) is None):
            results.append(ingest_file(f, st, uploaded_by="bootstrap"))
    runs = storage.list_runs()
    summary = {r["source_type"]: r["qc_report"] for r in reversed(runs) if r["status"] == "PASSED"}
    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    (config.PROCESSED_DIR / "data_quality_report.json").write_text(
        json.dumps(summary, indent=2, default=str), encoding="utf-8"
    )
    storage.put_kv("data_quality_report", summary)
    return results


def load_clean(source_type: str) -> pd.DataFrame | None:
    df = storage.read_table(source_type)
    if df is None:
        return None
    return df[df["qc_flag"] == ""].copy()


if __name__ == "__main__":
    res = bootstrap_from_raw(force=True)
    for r in res:
        print(f"[{r['source_type']}] status={r['status']} rows={r['n_rows']} clean={r['qc_report'].get('clean_rows')} extreme={r['qc_report'].get('extreme_event_distribution')}")
