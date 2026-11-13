"""Central AI orchestrator.

Owns the life of every request: routing by HN Executive AI, departmental work, collaboration,
hand-off, the Managing Director's approval and — only after a separate approval — any external
action. Publishes every change as a hub event for the 3D office.
"""

from __future__ import annotations

import asyncio
import logging
import random

from .auth import User
from .catalog import get_catalog
from .config import Settings
from .events import EventBus
from .models import (
    Activity,
    ActivityEntry,
    AgentState,
    Approval,
    AuditEntry,
    ChatMessage,
    SubmitTaskBody,
    Task,
    TaskStep,
    now_ms,
)
from .routing import derive_title, detect_external_action
from .storage import ArtifactStorage
from .store import Store
from .workforce import Workforce, WorkHooks

log = logging.getLogger(__name__)

OPEN = {"routing", "queued", "in_progress", "awaiting_approval"}


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


class Orchestrator:
    def __init__(self, settings: Settings, store: Store, bus: EventBus, storage: ArtifactStorage, workforce: Workforce) -> None:
        self.settings = settings
        self.store = store
        self.bus = bus
        self.storage = storage
        self.workforce = workforce
        self.execution = workforce.execution
        self.agents: dict[str, AgentState] = {}
        self.locks: dict[str, asyncio.Lock] = {}
        self.busy: set[str] = set()
        self._bg: set[asyncio.Task] = set()
        self._ambient: asyncio.Task | None = None
        self._routing = 0  # requests HN Executive AI is currently routing

    # --- lifecycle ----------------------------------------------------------------------------

    async def start(self) -> None:
        for agent_id in get_catalog().agents:
            self.agents[agent_id] = AgentState(id=agent_id, status="idle", activity=Activity(kind="desk"), task_label="Available")
            self.locks[agent_id] = asyncio.Lock()
        await self._refresh_executive()
        await self._log("system", "system", f"HN.CO backend online — agent execution is {self.execution}.")
        if self.settings.ambient_presence:
            self._ambient = asyncio.create_task(self._ambient_loop())

    async def stop(self) -> None:
        if self._ambient:
            self._ambient.cancel()
        for t in list(self._bg):
            t.cancel()

    def _spawn(self, coro) -> asyncio.Task:
        t = asyncio.create_task(coro)
        self._bg.add(t)
        t.add_done_callback(self._bg.discard)
        return t

    async def snapshot(self) -> dict:
        return {
            "type": "snapshot",
            "agents": [a.dump() for a in self.agents.values()],
            "tasks": [t.dump() for t in await self.store.list_tasks(200)],
            "approvals": [a.dump() for a in await self.store.list_approvals(200)],
            "activity": [e.dump() for e in await self.store.list_activity(150)],
            "execution": self.execution,
        }

    # --- helpers ------------------------------------------------------------------------------

    async def _set_agent(self, agent_id: str, **patch) -> None:
        current = self.agents[agent_id]
        if "activity" in patch and isinstance(patch["activity"], dict):
            patch["activity"] = Activity(**patch["activity"])
        nxt = current.model_copy(update=patch)
        self.agents[agent_id] = nxt
        self.bus.publish({"type": "agent.updated", "agent": nxt.dump()})

    async def _save_task(self, task: Task) -> None:
        task.updated_at = now_ms()
        await self.store.save_task(task)
        self.bus.publish({"type": "task.updated", "task": task.dump()})

    async def _save_approval(self, ap: Approval) -> None:
        await self.store.save_approval(ap)
        self.bus.publish({"type": "approval.updated", "approval": ap.dump()})

    async def _log(self, agent_id: str, kind: str, message: str, task_id: str | None = None) -> None:
        entry = ActivityEntry(agent_id=agent_id, kind=kind, message=message, task_id=task_id, execution=self.execution)  # type: ignore[arg-type]
        await self.store.add_activity(entry)
        self.bus.publish({"type": "activity", "entry": entry.dump()})

    async def _audit(self, user: User | None, action: str, target: str | None = None, /, **detail) -> None:
        await self.store.audit(
            AuditEntry(actor=user.name if user else "system", roles=user.roles if user else [], action=action, target=target, detail=detail)
        )

    def _name(self, agent_id: str) -> str:
        return get_catalog().name(agent_id)

    async def _refresh_executive(self) -> None:
        """HN Executive AI shows GOLD while anything awaits the Managing Director."""
        if "executive" in self.busy or self._routing:
            return
        pending = [a for a in await self.store.list_approvals(200) if a.status == "pending"]
        if pending:
            await self._set_agent(
                "executive",
                status="waiting",
                activity=Activity(kind="desk"),
                task_label=f"Awaiting Managing Director review ({len(pending)})",
                task_id=None,
            )
        elif self.agents["executive"].status == "waiting":
            await self._set_agent("executive", status="idle", activity=Activity(kind="desk"), task_label="Available", task_id=None)

    # --- commands -----------------------------------------------------------------------------

    async def submit(self, body: SubmitTaskBody, user: User) -> Task:
        cat = get_catalog()
        if body.target and body.target not in cat.agents:
            raise NotFound(f"Unknown agent {body.target}")
        via = f" via {body.via}" if body.via else ""
        task = Task(
            title=(body.title or "").strip() or derive_title(body.description),
            description=body.description.strip(),
            requested_by=user.name,
            assignee=body.target if body.target and body.target != "executive" else "executive",
            external_action=detect_external_action(body.description),
            execution=self.execution,
            steps=[TaskStep(agent_id="user", text=f"Request submitted by {user.name}{via}.")],
        )
        await self._save_task(task)
        await self._audit(user, "task.submit", task.id, title=task.title, requested_agent=body.target)
        await self._log("user", "task", f'New request: "{task.title}"', task.id)
        self._spawn(self._run(task.id, direct=bool(body.target and body.target != "executive")))
        return task

    async def chat(self, agent_id: str, text: str, user: User) -> ChatMessage:
        if agent_id not in self.agents:
            raise NotFound(agent_id)
        msg = ChatMessage(role="user", content=text, execution=self.execution)
        history = await self.store.list_chat(agent_id, 20)
        await self.store.add_chat(agent_id, msg)
        self.bus.publish({"type": "chat.message", "agentId": agent_id, "message": msg.dump()})
        await self._audit(user, "chat.message", agent_id, length=len(text))
        open_tasks = [t for t in await self.store.list_tasks(200) if t.status in OPEN]
        try:
            content = await self.workforce.reply(agent_id, history, text, self.agents[agent_id], open_tasks)
        except Exception as exc:  # surface failures honestly
            log.exception("chat failed")
            content = f"I could not answer just now ({type(exc).__name__}). Please try again."
        reply = ChatMessage(role="agent", content=content, execution=self.execution)
        await self.store.add_chat(agent_id, reply)
        self.bus.publish({"type": "chat.message", "agentId": agent_id, "message": reply.dump()})
        return reply

    async def decide(self, approval_id: str, decision: str, note: str | None, user: User) -> Approval:
        ap = await self.store.get_approval(approval_id)
        if not ap:
            raise NotFound(approval_id)
        if ap.status != "pending":
            raise Conflict("This approval has already been decided")
        task = await self.store.get_task(ap.task_id)
        if not task:
            raise NotFound(ap.task_id)
        ap.status = "approved" if decision == "approve" else "rejected"
        ap.decided_at = now_ms()
        ap.decided_by = user.name
        ap.note = note
        await self._save_approval(ap)
        await self._audit(user, f"approval.{decision}", ap.id, task=task.id, kind=ap.kind, note=note)

        if decision == "approve":
            await self._log("executive", "approval", f'{user.name} approved "{ap.title}"', task.id)
            if ap.kind == "deliverable_review" and task.external_action:
                task.steps.append(
                    TaskStep(
                        agent_id="executive", text=f"Deliverable approved. External action needs separate approval: {task.external_action}."
                    )
                )
                await self._save_task(task)
                await self._request_approval(task, "external_action")
            else:
                if ap.kind == "external_action":
                    # No outbound integrations are wired in this build: record the approval honestly.
                    task.steps.append(
                        TaskStep(
                            agent_id="executive",
                            text=f"External action approved by {user.name}: {task.external_action}. No integration is configured, so it was recorded but not executed.",
                        )
                    )
                    await self._audit(user, "external_action.approved_not_executed", task.id, action=task.external_action)
                task.status = "completed"
                task.progress = 100
                task.steps.append(TaskStep(agent_id="executive", text="Task completed and filed."))
                await self._save_task(task)
        elif decision == "revise":
            task.status = "queued"
            task.steps.append(TaskStep(agent_id="user", text=f"Changes requested{': ' + note if note else ''}."))
            if note:
                task.description += f"\n\nRevision requested by the Managing Director: {note}"
            await self._save_task(task)
            await self._log("executive", "approval", f'Changes requested on "{task.title}"', task.id)
            self._spawn(self._work(task.id))
        else:
            task.status = "rejected"
            task.steps.append(TaskStep(agent_id="user", text=f"Rejected{': ' + note if note else ''}."))
            await self._save_task(task)
            await self._log("executive", "approval", f'{user.name} rejected "{task.title}"', task.id)
        await self._refresh_executive()
        return ap

    async def resolve(self, agent_id: str, user: User) -> None:
        if agent_id not in self.agents:
            raise NotFound(agent_id)
        if self.agents[agent_id].status != "error":
            return
        await self._audit(user, "agent.resolve", agent_id)
        await self._log(agent_id, "status", f"{self._name(agent_id)}: issue acknowledged by {user.name}.")
        await self._set_agent(agent_id, status="idle", task_label="Available", error=None, activity=Activity(kind="desk"))

    # --- the pipeline -------------------------------------------------------------------------

    async def _run(self, task_id: str, direct: bool) -> None:
        task = await self.store.get_task(task_id)
        if not task:
            return
        # Show the Executive AI routing, unless it is busy on a task of its own.
        show = not self.locks["executive"].locked()
        self._routing += 1
        if show:
            await self._set_agent("executive", status="analysing", task_label=f"Routing: {task.title}", activity=Activity(kind="desk"))
        try:
            decision, external = await self.workforce.route(task.description)
        except Exception as exc:
            log.exception("routing failed")
            self._routing -= 1
            await self._fail(task, "executive", f"Routing failed ({type(exc).__name__})")
            return
        self._routing -= 1
        if direct:
            decision.collaborators = [c for c in decision.collaborators if c != task.assignee][:1]
            decision.assignee = task.assignee
            decision.reason = "Direct assignment confirmed."
        task.assignee = decision.assignee
        task.collaborators = decision.collaborators
        task.external_action = task.external_action or external
        task.status = "queued"
        task.steps.append(TaskStep(agent_id="executive", text=f"Routed to {self._name(task.assignee)}. {decision.reason}"))
        await self._save_task(task)
        await self._audit(None, "task.routed", task.id, assignee=task.assignee, collaborators=task.collaborators, reason=decision.reason)
        msg = f'Routed "{task.title}" to {self._name(task.assignee)}'
        if task.collaborators:
            msg += " with " + ", ".join(self._name(c) for c in task.collaborators)
        await self._log("executive", "task", msg, task.id)
        if show and not self._routing and not self.locks["executive"].locked():
            await self._set_agent("executive", status="idle", task_label="Available", activity=Activity(kind="desk"))
            await self._refresh_executive()
        await self._work(task.id)

    async def _pace(self, seconds: float) -> None:
        if self.execution == "simulated" and self.settings.simulated_pace > 0:
            await asyncio.sleep(seconds * self.settings.simulated_pace)
        elif self.execution == "live":
            await asyncio.sleep(min(seconds, 2.0))  # give the office time to show each phase

    async def _work(self, task_id: str) -> None:
        task = await self.store.get_task(task_id)
        if not task:
            return
        lead = task.assignee
        async with self.locks[lead]:
            self.busy.add(lead)
            try:
                task = await self.store.get_task(task_id) or task
                task.status = "in_progress"
                task.steps.append(TaskStep(agent_id=lead, text=f"{self._name(lead)} started work."))
                await self._save_task(task)
                await self._set_agent(
                    lead,
                    status="analysing",
                    activity=Activity(kind="desk"),
                    task_label=f"Reviewing — {task.title}",
                    task_id=task.id,
                    progress=task.progress,
                )

                # Collaborators contribute in parallel at their own desks.
                for c in task.collaborators:
                    self._spawn(self._support(task, c))

                async def on_progress(label: str, progress: float) -> None:
                    task.progress = max(task.progress, progress)
                    status = "analysing" if progress < 40 else "working"
                    await self._set_agent(lead, status=status, task_label=label, progress=task.progress, activity=Activity(kind="desk"))
                    await self._save_task(task)

                async def on_external(action: str) -> None:
                    if not task.external_action:
                        task.external_action = action
                        task.steps.append(TaskStep(agent_id=lead, text=f"Requested an external action (needs approval): {action}."))

                result = await self.workforce.produce(task, WorkHooks(on_progress=on_progress, on_external_action=on_external))

                if task.collaborators:
                    c0 = task.collaborators[0]
                    await self._set_agent(
                        lead,
                        status="working",
                        activity=Activity(kind="collaborate", with_agent=c0),
                        task_label=f"Aligning with {self._name(c0)}",
                    )
                    await self._pace(8)
                task.progress = 95
                await self._set_agent(
                    lead,
                    status="working",
                    activity=Activity(kind="handoff", with_agent="executive"),
                    task_label="Handing the draft to HN Executive AI",
                    progress=95,
                )
                await self._pace(8)

                result.artifact_url = await self.storage.put_text(f"deliverables/{task.id}.md", result.body)
                task.result = result
                task.progress = 100
                task.status = "awaiting_approval"
                task.steps.append(TaskStep(agent_id=lead, text="Draft sent to HN Executive AI."))
                task.steps.append(TaskStep(agent_id="executive", text="Presented to the Managing Director for review."))
                await self._save_task(task)
                await self._log(lead, "task", f'{self._name(lead)} delivered "{task.title}" to Executive AI', task.id)
                await self._request_approval(task, "deliverable_review")
                await self._set_agent(
                    lead, status="idle", activity=Activity(kind="desk"), task_label="Available", task_id=None, progress=None
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.exception("task failed")
                await self._fail(task, lead, f"{type(exc).__name__}: {exc}"[:200])
            finally:
                self.busy.discard(lead)

    async def _support(self, task: Task, agent_id: str) -> None:
        if agent_id in self.busy:
            return
        lead = self._name(task.assignee)
        self.busy.add(agent_id)
        try:
            await self._set_agent(
                agent_id, status="analysing", activity=Activity(kind="desk"), task_label=f"Supporting {lead}: {task.title}", task_id=task.id
            )
            await self._pace(6)
            await self._set_agent(agent_id, status="working", task_label=f"Preparing input for {lead}")
            await self._pace(9)
            t = await self.store.get_task(task.id)
            if t:
                t.steps.append(TaskStep(agent_id=agent_id, text=f"{self._name(agent_id)} delivered input to {lead}."))
                await self._save_task(t)
        finally:
            self.busy.discard(agent_id)
            await self._set_agent(agent_id, status="idle", activity=Activity(kind="desk"), task_label="Available", task_id=None)

    async def _request_approval(self, task: Task, kind: str) -> None:
        if kind == "deliverable_review":
            title, summary = f"Review: {task.title}", task.result.summary if task.result else ""
        else:
            title = f"External action: {task.external_action}"
            summary = f'{self._name(task.assignee)} requests permission to: {(task.external_action or "").lower()} for "{task.title}".'
        ap = Approval(task_id=task.id, kind=kind, title=title, summary=summary, execution=self.execution)  # type: ignore[arg-type]
        await self._save_approval(ap)
        await self._log("executive", "approval", f"Approval requested: {ap.title}", task.id)
        await self._refresh_executive()

    async def _fail(self, task: Task, agent_id: str, reason: str) -> None:
        task.status = "failed"
        task.steps.append(TaskStep(agent_id=agent_id, text=f"Failed: {reason}"))
        await self._save_task(task)
        await self._set_agent(
            agent_id, status="error", task_label=reason, error=reason, activity=Activity(kind="desk"), task_id=None, progress=None
        )
        await self._log(agent_id, "error", f"{self._name(agent_id)}: {reason}. Requires attention.", task.id)

    # --- ambient presence ---------------------------------------------------------------------

    async def _ambient_loop(self) -> None:
        """Idle agents move between desk, café and standing tables so the office looks lived in.
        This changes only *where* an idle agent is shown — never its status or any work."""
        rnd = random.Random()
        seats: dict[int, str] = {}
        while True:
            await asyncio.sleep(rnd.uniform(6, 14))
            idle = [a for a, s in self.agents.items() if s.status == "idle" and a not in self.busy and a != "executive"]
            if not idle:
                continue
            agent_id = rnd.choice(idle)
            for k, v in list(seats.items()):
                if v == agent_id:
                    del seats[k]
            roll = rnd.random()
            if roll < 0.45:
                await self._set_agent(agent_id, activity=Activity(kind="desk"), task_label="Available")
            elif roll < 0.7:
                free = [i for i in range(6) if i not in seats]
                if free:
                    seat = rnd.choice(free)
                    seats[seat] = agent_id
                    await self._set_agent(agent_id, activity=Activity(kind="break", seat=seat), task_label="On a short break")
            else:
                await self._set_agent(agent_id, activity=Activity(kind="idle"), task_label="Available")
