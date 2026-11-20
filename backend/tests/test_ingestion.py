import pandas as pd
import pytest

from conftest import make_forecast
from forexa import ingestion


def test_normalise_drops_leakage_and_converts_units():
    df, notes = ingestion.normalise(make_forecast(), "nwp")
    assert "weather_condition_actual" not in df.columns
    assert df["wind_ms"].iloc[0] == 5.0
    assert df["district"].iloc[0] == "Ernakulam"
    assert (df["valid_time"] - df["init_time"]).iloc[0] == pd.Timedelta(hours=24)


def test_missing_required_column_rejected():
    with pytest.raises(ingestion.IngestionError):
        ingestion.normalise(make_forecast().drop(columns=["pred_temp_c"]), "nwp")


def test_qc_flags_without_replacing():
    raw = make_forecast()
    raw.loc[0, "pred_humidity_pct"] = 140      # invalid
    raw.loc[1, "pred_temp_c"] = None           # missing
    raw = pd.concat([raw, raw.iloc[[2]]])      # duplicate
    raw.loc[len(raw)] = raw.iloc[3]
    raw.iloc[-1, raw.columns.get_loc("location")] = "Atlantis"
    df, _ = ingestion.normalise(raw, "nwp")
    df, rep = ingestion.quality_check(df, "nwp")
    assert rep["out_of_range"]["humidity_pct"] == 1
    assert df["humidity_pct"].iloc[0] == 140     # value kept, only flagged
    assert rep["duplicates"] >= 1
    assert "Atlantis" in rep["unknown_locations"]
    assert pd.isna(df["temp_c"].iloc[1]) and "missing" in df["qc_flag"].iloc[1]
    assert rep["status"] == "FAILED_QC"


def test_ingest_file_stores_raw_and_processed(tmp_env):
    p = tmp_env / "fc.csv"
    make_forecast().to_csv(p, index=False)
    row = ingestion.ingest_file(p, "ai", uploaded_by="tester")
    assert row["status"] == "PASSED"
    from forexa import storage
    assert storage.list_runs()[0]["run_id"] == row["run_id"]
    assert storage.read_table("ai") is not None
    assert (tmp_env / "raw" / "ai").exists()


def test_bad_file_recorded_as_error(tmp_env):
    p = tmp_env / "bad.csv"
    pd.DataFrame({"x": [1]}).to_csv(p, index=False)
    row = ingestion.ingest_file(p, "observations")
    assert row["status"] == "ERROR"
