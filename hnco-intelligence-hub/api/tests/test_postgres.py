"""PostgreSQL + pgvector store tests. Run with a database:

    HNCO_TEST_DATABASE_URL=postgresql+asyncpg://postgres@localhost:5433/hnco_test .venv/bin/pytest -q tests/test_postgres.py
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.main import create_app
from app.models import ActivityEntry, Approval, AuditEntry, ChatMessage, Task
from app.store.postgres import EMBED_DIM, PostgresStore

from .test_api import make_settings, pending_for, wait_for

URL = os.environ.get("HNCO_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="HNCO_TEST_DATABASE_URL not set")


@pytest.fixture
async def store():
    s = PostgresStore(URL)
    async with s.engine.begin() as conn:
        for t in ("tasks", "approvals", "activity", "chat_messages", "audit_log", "company_datasets", "knowledge_chunks"):
            await conn.execute(text(f"DROP TABLE IF EXISTS {t}"))
    await s.init()
    yield s
    await s.close()


def vec(i: int) -> list[float]:
    v = [0.0] * EMBED_DIM
    v[i] = 1.0
    return v


async def test_crud_round_trip(store: PostgresStore):
    assert store.vector, "pgvector should be available"
    t = Task(title="Q3 report", description="d", requested_by="MD", assignee="finance")
    await store.save_task(t)
    t.status = "in_progress"
    await store.save_task(t)  # upsert
    got = await store.get_task(t.id)
    assert got and got.status == "in_progress" and got.title == "Q3 report"
    assert [x.id for x in await store.list_tasks()] == [t.id]

    ap = Approval(task_id=t.id, kind="deliverable_review", title="Review", summary="s")
    await store.save_approval(ap)
    assert (await store.get_approval(ap.id)).task_id == t.id

    await store.add_activity(ActivityEntry(agent_id="finance", kind="task", message="m"))
    assert len(await store.list_activity()) == 1
    await store.add_chat("finance", ChatMessage(role="user", content="hi"))
    await store.add_chat("finance", ChatMessage(role="agent", content="hello"))
    assert [m.content for m in await store.list_chat("finance")] == ["hi", "hello"]
    await store.audit(AuditEntry(actor="MD", action="x"))
    assert (await store.list_audit())[0].action == "x"


async def test_authorised_datasets_seeded(store: PostgresStore):
    names = {d["name"] for d in await store.list_datasets()}
    assert {"finance.monthly_pnl", "crm.pipeline"} <= names
    pnl = await store.get_dataset("finance.monthly_pnl")
    assert pnl["demo"] is True and pnl["columns"][0] == "month"


async def test_pgvector_similarity_search(store: PostgresStore):
    await store.add_knowledge(
        [
            {"id": "a", "title": "Alpha", "content": "about alpha", "embedding": vec(1)},
            {"id": "b", "title": "Beta", "content": "about beta", "embedding": vec(2)},
        ]
    )
    hits = await store.search_knowledge("anything", vec(2), k=1)
    assert hits[0]["id"] == "b"
    # Without an embedding the store falls back to text matching over the seeded articles.
    text_hits = await store.search_knowledge("approval policy external action", None, k=2)
    assert any(h["id"] == "kb-approvals" for h in text_hits)


def test_full_flow_on_postgres(tmp_path):
    app = create_app(make_settings(tmp_path, database_url=URL))
    with TestClient(app) as client:
        assert client.get("/api/health").json()["store"] == "PostgresStore"
        task = client.post("/api/tasks", json={"description": "Prepare a financial performance report."}).json()
        ap, _ = wait_for(client, lambda s: pending_for(s, task["id"]))
        assert client.post(f"/api/approvals/{ap['id']}/decision", json={"decision": "approve"}).status_code == 200
        assert client.get(f"/api/tasks/{task['id']}").json()["status"] == "completed"
