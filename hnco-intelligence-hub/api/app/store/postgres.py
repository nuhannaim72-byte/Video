"""PostgreSQL store with pgvector for the knowledge base (SQLAlchemy 2 async + asyncpg)."""

from __future__ import annotations

import json
import logging

from sqlalchemy import BigInteger, Column, Index, MetaData, String, Table, Text, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from ..models import ActivityEntry, Approval, AuditEntry, ChatMessage, Task
from .seed import DATASETS, KNOWLEDGE

log = logging.getLogger(__name__)
EMBED_DIM = 1536

meta = MetaData()
tasks = Table(
    "tasks",
    meta,
    Column("id", String(40), primary_key=True),
    Column("status", String(24), index=True),
    Column("assignee", String(32), index=True),
    Column("created_at", BigInteger, index=True),
    Column("data", JSONB, nullable=False),
)
approvals = Table(
    "approvals",
    meta,
    Column("id", String(40), primary_key=True),
    Column("task_id", String(40), index=True),
    Column("status", String(16), index=True),
    Column("created_at", BigInteger, index=True),
    Column("data", JSONB, nullable=False),
)
activity = Table(
    "activity",
    meta,
    Column("id", String(40), primary_key=True),
    Column("ts", BigInteger, index=True),
    Column("agent_id", String(32), index=True),
    Column("data", JSONB, nullable=False),
)
chat = Table(
    "chat_messages",
    meta,
    Column("id", String(40), primary_key=True),
    Column("agent_id", String(32), index=True),
    Column("ts", BigInteger),
    Column("data", JSONB, nullable=False),
    Index("ix_chat_agent_ts", "agent_id", "ts"),
)
audit = Table(
    "audit_log",
    meta,
    Column("id", String(40), primary_key=True),
    Column("ts", BigInteger, index=True),
    Column("actor", String(200), index=True),
    Column("action", String(64), index=True),
    Column("data", JSONB, nullable=False),
)
datasets = Table(
    "company_datasets",
    meta,
    Column("name", String(80), primary_key=True),
    Column("description", Text),
    Column("data", JSONB, nullable=False),
)


class PostgresStore:
    def __init__(self, url: str) -> None:
        self.engine: AsyncEngine = create_async_engine(url, pool_pre_ping=True)
        self.vector = False

    async def init(self) -> None:
        try:
            async with self.engine.begin() as conn:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            self.vector = True
        except Exception as exc:  # pgvector not installed: knowledge search falls back to text
            log.warning("pgvector unavailable (%s); knowledge search will use text matching", exc)
        async with self.engine.begin() as conn:
            await conn.run_sync(meta.create_all)
            emb = f", embedding vector({EMBED_DIM})" if self.vector else ""
            await conn.execute(text(f"CREATE TABLE IF NOT EXISTS knowledge_chunks (id text primary key, title text, content text{emb})"))
            for name, d in DATASETS.items():
                await conn.execute(
                    text(
                        "INSERT INTO company_datasets (name, description, data) VALUES (:n, :d, CAST(:j AS jsonb)) "
                        "ON CONFLICT (name) DO NOTHING"
                    ),
                    {"n": name, "d": d["description"], "j": json.dumps(d)},
                )
            for k in KNOWLEDGE:
                await conn.execute(
                    text("INSERT INTO knowledge_chunks (id, title, content) VALUES (:i, :t, :c) ON CONFLICT (id) DO NOTHING"),
                    {"i": k["id"], "t": k["title"], "c": k["content"]},
                )

    async def close(self) -> None:
        await self.engine.dispose()

    async def _upsert(self, table: Table, row: dict) -> None:
        from sqlalchemy.dialects.postgresql import insert

        stmt = insert(table).values(**row)
        stmt = stmt.on_conflict_do_update(index_elements=[table.c[next(iter(table.primary_key.columns)).name]], set_=row)
        async with self.engine.begin() as conn:
            await conn.execute(stmt)

    async def save_task(self, task: Task) -> None:
        await self._upsert(
            tasks, {"id": task.id, "status": task.status, "assignee": task.assignee, "created_at": task.created_at, "data": task.dump()}
        )

    async def get_task(self, task_id: str) -> Task | None:
        async with self.engine.connect() as conn:
            row = (await conn.execute(select(tasks.c.data).where(tasks.c.id == task_id))).first()
        return Task.model_validate(row[0]) if row else None

    async def list_tasks(self, limit: int = 200) -> list[Task]:
        async with self.engine.connect() as conn:
            rows = (await conn.execute(select(tasks.c.data).order_by(tasks.c.created_at.desc()).limit(limit))).all()
        return [Task.model_validate(r[0]) for r in rows]

    async def save_approval(self, approval: Approval) -> None:
        await self._upsert(
            approvals,
            {
                "id": approval.id,
                "task_id": approval.task_id,
                "status": approval.status,
                "created_at": approval.created_at,
                "data": approval.dump(),
            },
        )

    async def get_approval(self, approval_id: str) -> Approval | None:
        async with self.engine.connect() as conn:
            row = (await conn.execute(select(approvals.c.data).where(approvals.c.id == approval_id))).first()
        return Approval.model_validate(row[0]) if row else None

    async def list_approvals(self, limit: int = 200) -> list[Approval]:
        async with self.engine.connect() as conn:
            rows = (await conn.execute(select(approvals.c.data).order_by(approvals.c.created_at.desc()).limit(limit))).all()
        return [Approval.model_validate(r[0]) for r in rows]

    async def add_activity(self, entry: ActivityEntry) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(activity.insert().values(id=entry.id, ts=entry.ts, agent_id=entry.agent_id, data=entry.dump()))

    async def list_activity(self, limit: int = 200) -> list[ActivityEntry]:
        async with self.engine.connect() as conn:
            rows = (await conn.execute(select(activity.c.data).order_by(activity.c.ts.desc()).limit(limit))).all()
        return [ActivityEntry.model_validate(r[0]) for r in rows]

    async def add_chat(self, agent_id: str, message: ChatMessage) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(chat.insert().values(id=message.id, agent_id=agent_id, ts=message.ts, data=message.dump()))

    async def list_chat(self, agent_id: str, limit: int = 30) -> list[ChatMessage]:
        async with self.engine.connect() as conn:
            rows = (
                await conn.execute(select(chat.c.data).where(chat.c.agent_id == agent_id).order_by(chat.c.ts.desc()).limit(limit))
            ).all()
        return [ChatMessage.model_validate(r[0]) for r in reversed(rows)]

    async def audit(self, entry: AuditEntry) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(audit.insert().values(id=entry.id, ts=entry.ts, actor=entry.actor, action=entry.action, data=entry.dump()))

    async def list_audit(self, limit: int = 500) -> list[AuditEntry]:
        async with self.engine.connect() as conn:
            rows = (await conn.execute(select(audit.c.data).order_by(audit.c.ts.desc()).limit(limit))).all()
        return [AuditEntry.model_validate(r[0]) for r in rows]

    async def get_dataset(self, name: str) -> dict | None:
        async with self.engine.connect() as conn:
            row = (await conn.execute(select(datasets.c.data).where(datasets.c.name == name))).first()
        return row[0] if row else None

    async def list_datasets(self) -> list[dict]:
        async with self.engine.connect() as conn:
            rows = (await conn.execute(select(datasets.c.name, datasets.c.description).order_by(datasets.c.name))).all()
        return [{"name": r[0], "description": r[1]} for r in rows]

    async def add_knowledge(self, chunks: list[dict]) -> None:
        async with self.engine.begin() as conn:
            for c in chunks:
                if self.vector and c.get("embedding"):
                    await conn.execute(
                        text(
                            "INSERT INTO knowledge_chunks (id, title, content, embedding) VALUES (:i, :t, :c, CAST(:e AS vector)) "
                            "ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, embedding = EXCLUDED.embedding"
                        ),
                        {"i": c["id"], "t": c["title"], "c": c["content"], "e": str(c["embedding"])},
                    )
                else:
                    await conn.execute(
                        text(
                            "INSERT INTO knowledge_chunks (id, title, content) VALUES (:i, :t, :c) "
                            "ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content"
                        ),
                        {"i": c["id"], "t": c["title"], "c": c["content"]},
                    )

    async def search_knowledge(self, query: str, embedding: list[float] | None, k: int = 4) -> list[dict]:
        async with self.engine.connect() as conn:
            if self.vector and embedding:
                rows = (
                    await conn.execute(
                        text(
                            "SELECT id, title, content FROM knowledge_chunks WHERE embedding IS NOT NULL "
                            "ORDER BY embedding <=> CAST(:e AS vector) LIMIT :k"
                        ),
                        {"e": str(embedding), "k": k},
                    )
                ).all()
                if rows:
                    return [{"id": r[0], "title": r[1], "content": r[2]} for r in rows]
            words = [w for w in query.lower().split() if len(w) > 3][:6] or [query.lower()]
            clause = " OR ".join(f"lower(title || ' ' || content) LIKE :w{i}" for i in range(len(words)))
            rows = (
                await conn.execute(
                    text(f"SELECT id, title, content FROM knowledge_chunks WHERE {clause} LIMIT :k"),
                    {**{f"w{i}": f"%{w}%" for i, w in enumerate(words)}, "k": k},
                )
            ).all()
        return [{"id": r[0], "title": r[1], "content": r[2]} for r in rows]
