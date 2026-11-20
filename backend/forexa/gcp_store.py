"""Stage 9: Google Cloud Storage + BigQuery Sync Adapter (opt-in via FOREXA_STORAGE=gcp)."""
from __future__ import annotations

from pathlib import Path
import pandas as pd

from . import config


def upload_file_to_gcs(local_path: str | Path, blob_rel_path: str) -> str:
    """Upload a local raw file, Parquet table, or XGBoost JSON artifact to GCS."""
    from google.cloud import storage as gcs

    client = gcs.Client(project=config.GCP_PROJECT_ID or None)
    bucket = client.bucket(config.GCS_BUCKET)
    blob = bucket.blob(blob_rel_path)
    blob.upload_from_filename(str(local_path))
    return f"gs://{config.GCS_BUCKET}/{blob_rel_path}"


def load_dataframe_to_bigquery(df: pd.DataFrame, table_name: str, write_disposition: str = "WRITE_TRUNCATE") -> str:
    """Load a processed pandas DataFrame into BigQuery dataset `forexa_kerala`."""
    from google.cloud import bigquery

    client = bigquery.Client(project=config.GCP_PROJECT_ID or None)
    table_id = f"{client.project}.{config.BQ_DATASET}.{table_name}"
    job_config = bigquery.LoadJobConfig(write_disposition=write_disposition)
    job = client.load_table_from_dataframe(df, table_id, job_config=job_config)
    job.result()
    return table_id


def sync_all_processed_tables_to_gcp() -> dict:
    """One-command sync of all local Parquet tables and model artifacts to GCS and BigQuery."""
    results = {"gcs": [], "bigquery": []}
    for pq in sorted(config.PROCESSED_DIR.glob("*.parquet")):
        uri = upload_file_to_gcs(pq, f"processed/{pq.name}")
        results["gcs"].append(uri)
        df = pd.read_parquet(pq)
        bq_id = load_dataframe_to_bigquery(df, pq.stem)
        results["bigquery"].append(bq_id)
    for art in sorted(config.ARTIFACT_DIR.glob("*.json")):
        results["gcs"].append(upload_file_to_gcs(art, f"artifacts/{art.name}"))
    return results
