"""DNC bulk API: queue message after hours, immediate in window (mocked)."""

import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("EXECUTION_MODE", "mocked")

from app.core.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture
def client(tmp_path, monkeypatch):
    db = tmp_path / "dnc.db"
    monkeypatch.setenv("DNC_QUEUE_DB_PATH", str(db))
    monkeypatch.delenv("DNC_API_KEY", raising=False)
    get_settings.cache_clear()
    with TestClient(app) as c:
        yield c
    get_settings.cache_clear()


def test_add_outside_window_queues(client, monkeypatch):
    monkeypatch.setattr(
        "app.api.dnc.is_dnc_add_allowed_now_pt",
        lambda now=None: False,
    )
    r = client.post(
        "/dnc/bulk",
        json={"action": "add", "numbers": ["5551112233", "5554445566"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["queued"] is True
    assert data["count"] == 2
    assert "after-hours" in data["message"].lower() or "queue for later" in data["message"].lower()
    assert data["job_id"]


def test_add_in_window_mocked_submits(client, monkeypatch):
    monkeypatch.setattr(
        "app.api.dnc.is_dnc_add_allowed_now_pt",
        lambda now=None: True,
    )
    r = client.post("/dnc/bulk", json={"action": "add", "numbers": ["5551112233"]})
    assert r.status_code == 200
    data = r.json()
    assert data["queued"] is False
    assert "Submitted" in data["message"]


def test_remove_always_immediate_mocked(client):
    r = client.post("/dnc/bulk", json={"action": "remove", "numbers": ["5551112233"]})
    assert r.status_code == 200
    assert r.json()["queued"] is False
    assert "Removed" in r.json()["message"]


def test_dnc_bulk_requires_api_key_when_configured(tmp_path, monkeypatch):
    db = tmp_path / "dnc2.db"
    monkeypatch.setenv("DNC_QUEUE_DB_PATH", str(db))
    monkeypatch.setenv("DNC_API_KEY", "secret-key-xyz")
    get_settings.cache_clear()
    try:
        with TestClient(app) as c:
            r = c.post("/dnc/bulk", json={"action": "remove", "numbers": ["5551112233"]})
            assert r.status_code == 401
            r2 = c.post(
                "/dnc/bulk",
                json={"action": "remove", "numbers": ["5551112233"]},
                headers={"X-DNC-API-Key": "secret-key-xyz"},
            )
            assert r2.status_code == 200
    finally:
        monkeypatch.delenv("DNC_API_KEY", raising=False)
        get_settings.cache_clear()
