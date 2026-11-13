"""Departmental AI agents. `SimulatedWorkforce` without an API key, `AgentsSdkWorkforce` with one."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Protocol

from ..models import AgentState, ChatMessage, Execution, Task, TaskResult
from ..routing import RoutingDecision

# Which authorised datasets each department may read. Enforced in the data tools.
DATA_ACCESS: dict[str, list[str]] = {
    "executive": ["*"],
    "finance": ["finance.monthly_pnl", "finance.cash_position", "finance.budget_vs_actual"],
    "bi": ["finance.monthly_pnl", "crm.pipeline", "clients.health", "projects.status"],
    "strategy": ["finance.monthly_pnl", "crm.pipeline", "clients.health"],
    "bizdev": ["crm.pipeline", "clients.health"],
    "marketing": ["crm.pipeline"],
    "project": ["projects.status"],
    "dataeng": ["projects.status"],
    "technology": ["projects.status"],
    "hr": ["people.headcount"],
    "legal": ["projects.status"],
    "clientsuccess": ["clients.health", "projects.status"],
}


def can_read(agent_id: str, dataset: str) -> bool:
    allowed = DATA_ACCESS.get(agent_id, [])
    return "*" in allowed or dataset in allowed


@dataclass
class WorkHooks:
    """Callbacks the orchestrator gives a running agent so the office can show what it is doing."""

    on_progress: Callable[[str, float], Awaitable[None]]  # (label, progress 0-100)
    on_external_action: Callable[[str], Awaitable[None]]
    notes: list[str] = field(default_factory=list)


class Workforce(Protocol):
    execution: Execution

    async def route(self, text: str) -> tuple[RoutingDecision, str | None]: ...

    async def produce(self, task: Task, hooks: WorkHooks) -> TaskResult: ...

    async def reply(self, agent_id: str, history: list[ChatMessage], text: str, state: AgentState, open_tasks: list[Task]) -> str: ...
