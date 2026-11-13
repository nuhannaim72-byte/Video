"""Event protocol and domain models. JSON uses camelCase to match web/src/lib/types.ts."""

from __future__ import annotations

import time
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

AgentStatus = Literal["working", "analysing", "waiting", "idle", "error"]
ActivityKind = Literal["desk", "workstation", "meeting", "present", "collaborate", "break", "idle", "handoff"]
Execution = Literal["simulated", "live"]
TaskStatus = Literal["routing", "queued", "in_progress", "awaiting_approval", "approved", "rejected", "completed", "failed"]


def now_ms() -> int:
    return int(time.time() * 1000)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    def dump(self) -> dict:
        return self.model_dump(by_alias=True, mode="json")


class Activity(Camel):
    kind: ActivityKind
    with_agent: str | None = None
    seat: int | None = None


class AgentState(Camel):
    id: str
    status: AgentStatus = "idle"
    activity: Activity = Field(default_factory=lambda: Activity(kind="desk"))
    task_label: str = "Available"
    task_id: str | None = None
    progress: float | None = None
    error: str | None = None


class TaskStep(Camel):
    ts: int = Field(default_factory=now_ms)
    agent_id: str
    text: str


class TaskResult(Camel):
    summary: str
    body: str
    artifact_url: str | None = None


class Task(Camel):
    id: str = Field(default_factory=lambda: new_id("task"))
    title: str
    description: str
    requested_by: str
    assignee: str
    collaborators: list[str] = Field(default_factory=list)
    routed_by: str | None = "executive"
    status: TaskStatus = "routing"
    progress: float = 0
    created_at: int = Field(default_factory=now_ms)
    updated_at: int = Field(default_factory=now_ms)
    external_action: str | None = None
    result: TaskResult | None = None
    steps: list[TaskStep] = Field(default_factory=list)
    execution: Execution = "simulated"


class Approval(Camel):
    id: str = Field(default_factory=lambda: new_id("appr"))
    task_id: str
    kind: Literal["deliverable_review", "external_action"]
    title: str
    summary: str
    requested_by: str = "executive"
    status: Literal["pending", "approved", "rejected"] = "pending"
    created_at: int = Field(default_factory=now_ms)
    decided_at: int | None = None
    decided_by: str | None = None
    note: str | None = None
    execution: Execution = "simulated"


class ActivityEntry(Camel):
    id: str = Field(default_factory=lambda: new_id("act"))
    ts: int = Field(default_factory=now_ms)
    agent_id: str
    kind: Literal["task", "status", "chat", "approval", "movement", "error", "system"]
    message: str
    task_id: str | None = None
    execution: Execution = "simulated"


class ChatMessage(Camel):
    id: str = Field(default_factory=lambda: new_id("msg"))
    ts: int = Field(default_factory=now_ms)
    role: Literal["user", "agent"]
    content: str
    execution: Execution = "simulated"


class AuditEntry(Camel):
    id: str = Field(default_factory=lambda: new_id("audit"))
    ts: int = Field(default_factory=now_ms)
    actor: str
    roles: list[str] = Field(default_factory=list)
    action: str
    target: str | None = None
    detail: dict = Field(default_factory=dict)


# --- API request bodies -------------------------------------------------------------------------


class SubmitTaskBody(Camel):
    title: str | None = None
    description: str = Field(min_length=3, max_length=4000)
    target: str | None = None
    via: str | None = None


class ChatBody(Camel):
    message: str = Field(min_length=1, max_length=4000)


class DecisionBody(Camel):
    decision: Literal["approve", "reject", "revise"]
    note: str | None = Field(default=None, max_length=2000)
