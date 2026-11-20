"""Storage abstraction. Local = Parquet + DuckDB; GCP = GCS + BigQuery (see gcp_store)."""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path

import duckdb
import pandas as pd

from . import config

_lock = threading.Lock()


def _con():
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    return duckdb.connect(str(config.DB_PATH))


def init_db() -> None:
    with _lock, _con() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS ingestion_runs(
                run_id VARCHAR PRIMARY KEY, file_name VARCHAR, source_type VARCHAR,
                raw_uri VARCHAR, processed_uri VARCHAR, size_bytes BIGINT, n_rows BIGINT,
                status VARCHAR, qc_report JSON, uploaded_by VARCHAR, created_at TIMESTAMP)"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS kv(key VARCHAR PRIMARY KEY, value JSON, updated_at TIMESTAMP)"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS user_accounts(
                uid VARCHAR PRIMARY KEY, email VARCHAR, role VARCHAR,
                state_region VARCHAR, auth_provider VARCHAR,
                assigned_district VARCHAR, receiver_mobile VARCHAR,
                created_at TIMESTAMP, last_login_at TIMESTAMP)"""
        )
        for col_sql in (
            "ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS assigned_district VARCHAR",
            "ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS receiver_mobile VARCHAR",
        ):
            try:
                c.execute(col_sql)
            except Exception:
                pass
        c.execute(
            """CREATE TABLE IF NOT EXISTS login_audit_logs(
                event_id VARCHAR PRIMARY KEY, uid VARCHAR, email VARCHAR,
                selected_role VARCHAR, action VARCHAR, status VARCHAR,
                state_region VARCHAR, auth_provider VARCHAR, user_agent VARCHAR,
                firestore_synced BOOLEAN, timestamp TIMESTAMP)"""
        )
        c.execute(
            """CREATE TABLE IF NOT EXISTS forecast_feedback_ledger(
                forecast_id VARCHAR PRIMARY KEY,
                district VARCHAR,
                init_time VARCHAR,
                valid_time VARCHAR,
                lead_h INTEGER,
                source_predictions JSON,
                adaptive_weights JSON,
                final_blended_forecast JSON,
                event_category VARCHAR,
                model_version VARCHAR,
                reference_observation JSON,
                source_errors JSON,
                blended_error JSON,
                verification_status VARCHAR,
                is_synthetic_observation BOOLEAN,
                created_at TIMESTAMP,
                verified_at TIMESTAMP)"""
        )


def upsert_user_account(row: dict) -> dict:
    init_db()
    now = datetime.now(timezone.utc)
    with _lock, _con() as c:
        existing = c.execute(
            "SELECT created_at, role, state_region, assigned_district, receiver_mobile FROM user_accounts WHERE uid=?",
            [row["uid"]],
        ).fetchone()
        created_at = existing[0] if existing else now
        role = row.get("role") or (existing[1] if existing else "authority")
        state_region = row.get("state_region") or (existing[2] if existing else "Kerala")
        assigned_district = row.get("assigned_district") or (existing[3] if existing and len(existing) > 3 else "Wayanad")
        receiver_mobile = row.get("receiver_mobile") or (existing[4] if existing and len(existing) > 4 else "")
        c.execute(
            """INSERT OR REPLACE INTO user_accounts
               (uid, email, role, state_region, auth_provider, assigned_district, receiver_mobile, created_at, last_login_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                row["uid"],
                row.get("email", ""),
                role,
                state_region,
                row.get("auth_provider", "password"),
                assigned_district,
                receiver_mobile,
                created_at,
                now,
            ],
        )
    return {
        "uid": row["uid"],
        "email": row.get("email", ""),
        "role": role,
        "state_region": state_region,
        "assigned_district": assigned_district,
        "receiver_mobile": receiver_mobile,
        "auth_provider": row.get("auth_provider", "password"),
        "last_login_at": now.isoformat(),
    }


def record_login_audit(row: dict) -> dict:
    init_db()
    now = datetime.now(timezone.utc)
    rec = {
        "event_id": row["event_id"],
        "uid": row.get("uid", ""),
        "email": row.get("email", ""),
        "selected_role": row.get("selected_role", "authority"),
        "action": row.get("action", "SIGN_IN"),
        "status": row.get("status", "SUCCESS"),
        "state_region": row.get("state_region", "Kerala"),
        "auth_provider": row.get("auth_provider", "password"),
        "user_agent": row.get("user_agent", ""),
        "firestore_synced": bool(row.get("firestore_synced", True)),
        "timestamp": now,
    }
    cols = ",".join(rec.keys())
    with _lock, _con() as c:
        c.execute(
            f"INSERT OR REPLACE INTO login_audit_logs({cols}) VALUES ({','.join('?' * len(rec))})",
            list(rec.values()),
        )
    return {**rec, "timestamp": now.isoformat()}


def list_login_audits(limit: int = 100) -> list[dict]:
    init_db()
    with _lock, _con() as c:
        df = c.execute("SELECT * FROM login_audit_logs ORDER BY timestamp DESC LIMIT ?", [limit]).df()
    return df.to_dict("records")


def list_user_accounts() -> list[dict]:
    init_db()
    with _lock, _con() as c:
        df = c.execute("SELECT * FROM user_accounts ORDER BY last_login_at DESC").df()
    return df.to_dict("records")


def record_run(row: dict) -> None:
    init_db()
    row = {**row, "qc_report": json.dumps(row.get("qc_report", {}), default=str)}
    cols = ",".join(row)
    with _lock, _con() as c:
        c.execute(
            f"INSERT OR REPLACE INTO ingestion_runs({cols}) VALUES ({','.join('?' * len(row))})",
            list(row.values()),
        )


def list_runs() -> list[dict]:
    init_db()
    with _lock, _con() as c:
        df = c.execute("SELECT * FROM ingestion_runs ORDER BY created_at DESC").df()
    out = df.to_dict("records")
    for r in out:
        r["qc_report"] = json.loads(r["qc_report"]) if r["qc_report"] else {}
    return out


def put_kv(key: str, value) -> None:
    init_db()
    with _lock, _con() as c:
        c.execute(
            "INSERT OR REPLACE INTO kv VALUES (?,?,?)",
            [key, json.dumps(value, default=str), datetime.now(timezone.utc)],
        )


def get_kv(key: str, default=None):
    init_db()
    with _lock, _con() as c:
        r = c.execute("SELECT value FROM kv WHERE key=?", [key]).fetchone()
    return json.loads(r[0]) if r else default


# --- tabular datasets (processed) ------------------------------------------
def table_path(name: str) -> Path:
    config.PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    return config.PROCESSED_DIR / f"{name}.parquet"


def write_table(name: str, df: pd.DataFrame) -> str:
    p = table_path(name)
    df.to_parquet(p, index=False)
    return str(p)


def read_table(name: str) -> pd.DataFrame | None:
    p = table_path(name)
    return pd.read_parquet(p) if p.exists() else None


def upsert_forecast_feedback_entry(row: dict) -> dict:
    """Persist or update a forecast feedback & observation-verification record in DuckDB."""
    init_db()
    now = datetime.now(timezone.utc)
    with _lock, _con() as c:
        c.execute(
            """INSERT OR REPLACE INTO forecast_feedback_ledger(
                forecast_id, district, init_time, valid_time, lead_h,
                source_predictions, adaptive_weights, final_blended_forecast,
                event_category, model_version, reference_observation,
                source_errors, blended_error, verification_status,
                is_synthetic_observation, created_at, verified_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                row["forecast_id"],
                row["district"],
                str(row["init_time"]),
                str(row["valid_time"]),
                int(row["lead_h"]),
                json.dumps(row.get("source_predictions", {}), default=str),
                json.dumps(row.get("adaptive_weights", {}), default=str),
                json.dumps(row.get("final_blended_forecast", {}), default=str),
                str(row.get("event_category", "Normal Weather")),
                str(row.get("model_version", "")),
                json.dumps(row.get("reference_observation"), default=str) if row.get("reference_observation") is not None else None,
                json.dumps(row.get("source_errors"), default=str) if row.get("source_errors") is not None else None,
                json.dumps(row.get("blended_error"), default=str) if row.get("blended_error") is not None else None,
                str(row.get("verification_status", "PENDING")),
                bool(row.get("is_synthetic_observation", True)),
                now,
                now if row.get("verification_status") == "VERIFIED" else None,
            ],
        )
    return row


def store_forecast_feedback_batch(rows: list[dict]) -> int:
    """Batch-insert forecast feedback & observation-verification records in a single DuckDB transaction."""
    if not rows:
        return 0
    init_db()
    now = datetime.now(timezone.utc)
    params = [
        [
            r["forecast_id"],
            r["district"],
            str(r["init_time"]),
            str(r["valid_time"]),
            int(r["lead_h"]),
            json.dumps(r.get("source_predictions", {}), default=str),
            json.dumps(r.get("adaptive_weights", {}), default=str),
            json.dumps(r.get("final_blended_forecast", {}), default=str),
            str(r.get("event_category", "Normal Weather")),
            str(r.get("model_version", "")),
            json.dumps(r.get("reference_observation"), default=str) if r.get("reference_observation") is not None else None,
            json.dumps(r.get("source_errors"), default=str) if r.get("source_errors") is not None else None,
            json.dumps(r.get("blended_error"), default=str) if r.get("blended_error") is not None else None,
            str(r.get("verification_status", "PENDING")),
            bool(r.get("is_synthetic_observation", True)),
            now,
            now if r.get("verification_status") == "VERIFIED" else None,
        ]
        for r in rows
    ]
    with _lock, _con() as c:
        c.executemany(
            """INSERT OR REPLACE INTO forecast_feedback_ledger(
                forecast_id, district, init_time, valid_time, lead_h,
                source_predictions, adaptive_weights, final_blended_forecast,
                event_category, model_version, reference_observation,
                source_errors, blended_error, verification_status,
                is_synthetic_observation, created_at, verified_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            params,
        )
    return len(params)


def list_forecast_feedback_ledger(limit: int = 100) -> list[dict]:
    init_db()
    with _lock, _con() as c:
        df = c.execute(
            "SELECT * FROM forecast_feedback_ledger ORDER BY init_time DESC, district ASC LIMIT ?",
            [limit],
        ).df()
    records = df.to_dict("records")
    json_cols = (
        "source_predictions",
        "adaptive_weights",
        "final_blended_forecast",
        "reference_observation",
        "source_errors",
        "blended_error",
    )
    for r in records:
        for col in json_cols:
            if r.get(col) and isinstance(r[col], str):
                try:
                    r[col] = json.loads(r[col])
                except Exception:
                    pass
    return records

