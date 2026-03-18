"""SQLite persistence for after-hours DNC add jobs."""

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import get_settings


def _db_path() -> Path:
    p = Path(get_settings().dnc_queue_db_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(_db_path()), timeout=30)
    c.row_factory = sqlite3.Row
    return c


def init_db() -> None:
    with _conn() as c:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS dnc_jobs (
                id TEXT PRIMARY KEY,
                action TEXT NOT NULL,
                numbers_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                error TEXT
            )
            """
        )
        c.execute("CREATE INDEX IF NOT EXISTS idx_dnc_jobs_status ON dnc_jobs(status, created_at)")
        c.commit()


def enqueue_add(numbers_e164: list[str]) -> str:
    init_db()
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as c:
        c.execute(
            """
            INSERT INTO dnc_jobs (id, action, numbers_json, status, created_at)
            VALUES (?, 'add', ?, 'pending', ?)
            """,
            (job_id, json.dumps(numbers_e164), now),
        )
        c.commit()
    return job_id


def fetch_pending_add_jobs(limit: int = 10) -> list[dict[str, Any]]:
    init_db()
    with _conn() as c:
        rows = c.execute(
            """
            SELECT id, numbers_json FROM dnc_jobs
            WHERE status = 'pending' AND action = 'add'
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [{"id": r["id"], "numbers": json.loads(r["numbers_json"])} for r in rows]


def mark_running(job_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as c:
        c.execute(
            "UPDATE dnc_jobs SET status = 'running', started_at = ? WHERE id = ? AND status = 'pending'",
            (now, job_id),
        )
        c.commit()


def mark_completed(job_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as c:
        c.execute(
            "UPDATE dnc_jobs SET status = 'completed', completed_at = ?, error = NULL WHERE id = ?",
            (now, job_id),
        )
        c.commit()


def mark_failed(job_id: str, error: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    err = error[:2000]
    with _conn() as c:
        c.execute(
            """
            UPDATE dnc_jobs SET status = 'failed', completed_at = ?, error = ?
            WHERE id = ?
            """,
            (now, err, job_id),
        )
        c.commit()


def get_job(job_id: str) -> dict[str, Any] | None:
    init_db()
    with _conn() as c:
        row = c.execute("SELECT * FROM dnc_jobs WHERE id = ?", (job_id,)).fetchone()
    if not row:
        return None
    return {k: row[k] for k in row.keys()}


def reset_running_to_pending(job_id: str) -> None:
    """If worker crashes mid-job, allow retry."""
    with _conn() as c:
        c.execute(
            "UPDATE dnc_jobs SET status = 'pending', started_at = NULL WHERE id = ? AND status = 'running'",
            (job_id,),
        )
        c.commit()
