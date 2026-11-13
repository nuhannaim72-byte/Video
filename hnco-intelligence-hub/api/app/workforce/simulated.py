"""Template-based stand-in for the AI agents. Every output says it is simulated."""

from __future__ import annotations

import asyncio
import random

from ..catalog import get_catalog
from ..models import AgentState, ChatMessage, Task, TaskResult
from ..routing import RoutingDecision, detect_external_action, route_by_keywords
from . import WorkHooks

NOTE = (
    "> **Simulated draft.** Produced by the HN.CO backend in simulated mode (no AI key configured) with "
    "illustrative figures — not real company data."
)

PHASES = {
    "finance": ("Analysing authorised financial data", "Preparing the draft report"),
    "bi": ("Running the analysis on authorised datasets", "Building visualisations"),
    "strategy": ("Researching market and competitor data", "Drafting strategic recommendations"),
    "bizdev": ("Reviewing CRM pipeline data", "Drafting the proposal"),
    "marketing": ("Analysing channel and campaign data", "Drafting campaign content"),
    "project": ("Reviewing timelines and dependencies", "Updating the plan"),
    "dataeng": ("Profiling source systems", "Designing the pipeline"),
    "technology": ("Mapping the current workflow", "Designing the automation"),
    "hr": ("Reviewing HR policies", "Drafting the HR document"),
    "legal": ("Researching the legal and regulatory position", "Annotating clauses and risks"),
    "clientsuccess": ("Reviewing account health and feedback", "Preparing the client review"),
    "executive": ("Reviewing the request", "Compiling the executive brief"),
}


class SimulatedWorkforce:
    execution = "simulated"

    def __init__(self, pace: float = 1.0) -> None:
        self.pace = pace

    async def _wait(self, seconds: float) -> None:
        if self.pace > 0:
            await asyncio.sleep(seconds * self.pace)

    async def route(self, text: str) -> tuple[RoutingDecision, str | None]:
        await self._wait(2.5)
        return route_by_keywords(text), detect_external_action(text)

    async def produce(self, task: Task, hooks: WorkHooks) -> TaskResult:
        analyse, work = PHASES.get(task.assignee, PHASES["strategy"])
        await hooks.on_progress(f"{analyse} — {task.title}", 10)
        for p in (18, 26):
            await self._wait(3)
            await hooks.on_progress(f"{analyse} — {task.title}", p)
        for p in (40, 55, 70, 85):
            await self._wait(3)
            await hooks.on_progress(f"{work} — {task.title}", p)
        cat = get_catalog()
        rnd = random.Random(task.id)
        name = cat.name(task.assignee)
        body = (
            f"## {task.title}\n_Prepared by {name} · routed by HN Executive AI_\n\n{NOTE}\n\n"
            f"### Summary\n- Scope: {task.description}\n- Key figure: {rnd.randint(3, 14)}% improvement against the comparable period (illustrative).\n"
            f"- Confidence: {rnd.choice(['medium', 'high'])}; based on authorised demo datasets only.\n\n"
            "### Findings\n1. The main driver is concentrated in two service lines.\n2. Variance against plan is within tolerance.\n"
            "3. One risk needs a decision from the Managing Director.\n\n"
            "### Recommendation\nApprove the draft for internal circulation; any external use needs a separate approval."
        )
        collab = ""
        if task.collaborators:
            collab = " with input from " + " and ".join(cat.name(c) for c in task.collaborators)
        return TaskResult(summary=f"Draft prepared by {name}{collab}. Ready for Managing Director review (simulated).", body=body)

    async def reply(self, agent_id: str, history: list[ChatMessage], text: str, state: AgentState, open_tasks: list[Task]) -> str:
        await self._wait(1)
        a = get_catalog().agents[agent_id]
        t = text.lower()
        if any(w in t for w in ("status", "working on", "doing", "progress", "busy")):
            mine = [x for x in open_tasks if x.assignee == agent_id]
            tasks = "; ".join(f'"{x.title}" ({x.status.replace("_", " ")}, {round(x.progress)}%)' for x in mine) or "no assigned tasks"
            reply = f"Currently: {state.task_label}. Open work: {tasks}."
        elif any(w in t for w in ("who are you", "your role", "what do you do", "what can you do")):
            reply = f"{a.job_description} Responsibilities: {', '.join(a.responsibilities).lower()}."
        else:
            reply = (
                f"From the {get_catalog().departments[a.department]['name']} side I would start with "
                f"{random.choice(a.responsibilities).lower()}. Assign it as a task and HN Executive AI will route and track it."
            )
        return f"{reply}\n\n_Simulated response — the backend has no AI key configured._"
