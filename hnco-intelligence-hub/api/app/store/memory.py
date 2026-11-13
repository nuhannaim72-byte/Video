from __future__ import annotations

from collections import defaultdict

from ..models import ActivityEntry, Approval, AuditEntry, ChatMessage, Task
from .seed import DATASETS, KNOWLEDGE


class MemoryStore:
    """Process-local store for development and tests. Data is lost on restart."""

    def __init__(self) -> None:
        self.tasks: dict[str, Task] = {}
        self.approvals: dict[str, Approval] = {}
        self.activity: list[ActivityEntry] = []
        self.chats: dict[str, list[ChatMessage]] = defaultdict(list)
        self.audit_log: list[AuditEntry] = []
        self.knowledge: list[dict] = []

    async def init(self) -> None:
        self.knowledge = [dict(k) for k in KNOWLEDGE]

    async def close(self) -> None:
        return None

    async def save_task(self, task: Task) -> None:
        self.tasks[task.id] = task.model_copy(deep=True)

    async def get_task(self, task_id: str) -> Task | None:
        t = self.tasks.get(task_id)
        return t.model_copy(deep=True) if t else None

    async def list_tasks(self, limit: int = 200) -> list[Task]:
        return sorted((t.model_copy(deep=True) for t in self.tasks.values()), key=lambda t: -t.created_at)[:limit]

    async def save_approval(self, approval: Approval) -> None:
        self.approvals[approval.id] = approval.model_copy(deep=True)

    async def get_approval(self, approval_id: str) -> Approval | None:
        a = self.approvals.get(approval_id)
        return a.model_copy(deep=True) if a else None

    async def list_approvals(self, limit: int = 200) -> list[Approval]:
        return sorted((a.model_copy(deep=True) for a in self.approvals.values()), key=lambda a: -a.created_at)[:limit]

    async def add_activity(self, entry: ActivityEntry) -> None:
        self.activity.append(entry)
        del self.activity[:-2000]

    async def list_activity(self, limit: int = 200) -> list[ActivityEntry]:
        return list(reversed(self.activity[-limit:]))

    async def add_chat(self, agent_id: str, message: ChatMessage) -> None:
        self.chats[agent_id].append(message)

    async def list_chat(self, agent_id: str, limit: int = 30) -> list[ChatMessage]:
        return self.chats[agent_id][-limit:]

    async def audit(self, entry: AuditEntry) -> None:
        self.audit_log.append(entry)

    async def list_audit(self, limit: int = 500) -> list[AuditEntry]:
        return list(reversed(self.audit_log[-limit:]))

    async def get_dataset(self, name: str) -> dict | None:
        return DATASETS.get(name)

    async def list_datasets(self) -> list[dict]:
        return [{"name": k, "description": v["description"]} for k, v in DATASETS.items()]

    async def add_knowledge(self, chunks: list[dict]) -> None:
        self.knowledge.extend(chunks)

    async def search_knowledge(self, query: str, embedding: list[float] | None, k: int = 4) -> list[dict]:
        # Keyword overlap ranking (the Postgres store uses pgvector similarity instead).
        words = {w for w in query.lower().split() if len(w) > 3}
        scored = [(sum(w in (c["title"] + " " + c["content"]).lower() for w in words), c) for c in self.knowledge]
        return [c for s, c in sorted(scored, key=lambda x: -x[0]) if s > 0][:k]
