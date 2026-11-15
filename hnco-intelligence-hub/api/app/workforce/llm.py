"""Departmental AI agents built with the OpenAI Agents SDK.

* HN Executive AI routes each request (structured output) — the central orchestrator's decision.
* Each department agent drafts deliverables using only tools that read *authorised* data.
* Agents can only *request* an external action; the orchestrator turns that into an approval.
  No tool here can send, publish, pay or sign anything.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from agents import Agent, ModelSettings, RunContextWrapper, Runner, function_tool
from agents.models.interface import Model
from pydantic import BaseModel, Field

from ..catalog import get_catalog
from ..models import AgentState, ChatMessage, Task, TaskResult
from ..routing import RoutingDecision, route_by_keywords
from ..store import Store
from . import DATA_ACCESS, WorkHooks, can_read

log = logging.getLogger(__name__)


@dataclass
class AgentContext:
    agent_id: str
    store: Store
    hooks: WorkHooks | None = None
    embed: Any = None  # async (text) -> list[float] | None
    tool_calls: int = 0


# --- Tools ------------------------------------------------------------------------------------


async def _bump(ctx: RunContextWrapper[AgentContext], label: str) -> None:
    c = ctx.context
    c.tool_calls += 1
    if c.hooks:
        await c.hooks.on_progress(label, min(80.0, 25 + c.tool_calls * 12))


@function_tool
async def list_company_datasets(ctx: RunContextWrapper[AgentContext]) -> str:
    """List the authorised company datasets this agent may read."""
    all_sets = await ctx.context.store.list_datasets()
    allowed = [d for d in all_sets if can_read(ctx.context.agent_id, d["name"])]
    return json.dumps(allowed)


@function_tool
async def query_company_data(ctx: RunContextWrapper[AgentContext], dataset: str) -> str:
    """Read one authorised company dataset (columns and rows).

    Args:
        dataset: Dataset name from list_company_datasets, e.g. "finance.monthly_pnl".
    """
    if not can_read(ctx.context.agent_id, dataset):
        return json.dumps({"error": f"Access denied: {dataset} is not authorised for this department."})
    data = await ctx.context.store.get_dataset(dataset)
    if data is None:
        return json.dumps({"error": f"Unknown dataset {dataset}"})
    await _bump(ctx, f"Analysing {dataset}")
    return json.dumps(data)


@function_tool
async def search_knowledge_base(ctx: RunContextWrapper[AgentContext], query: str) -> str:
    """Search HN.CO policies, methods and standards.

    Args:
        query: What to look for, in plain words.
    """
    embedding = await ctx.context.embed(query) if ctx.context.embed else None
    hits = await ctx.context.store.search_knowledge(query, embedding, k=4)
    await _bump(ctx, "Consulting the knowledge base")
    return json.dumps([{"title": h["title"], "content": h["content"]} for h in hits])


@function_tool
async def request_external_action(ctx: RunContextWrapper[AgentContext], action: str) -> str:
    """Ask the Managing Director for permission to do something outside the company
    (send, publish, submit, sign, pay, contact a client). This does NOT perform the action.

    Args:
        action: Short description of the external action, e.g. "Email the report to the client sponsor".
    """
    if ctx.context.hooks:
        await ctx.context.hooks.on_external_action(action)
    return "Recorded. The action will only happen if the Managing Director approves it. Do not claim it has been done."


TOOLS = [list_company_datasets, query_company_data, search_knowledge_base, request_external_action]


# --- Structured outputs -----------------------------------------------------------------------


class RoutingOutput(BaseModel):
    assignee: str = Field(description="Department agent id that leads the work")
    collaborators: list[str] = Field(default_factory=list, description="Up to two supporting agent ids")
    reason: str = Field(description="One sentence explaining the routing decision")
    external_action: str | None = Field(default=None, description="External action implied by the request, if any")


class DeliverableOutput(BaseModel):
    summary: str = Field(description="One or two sentences for the Managing Director")
    body_markdown: str = Field(description="The full deliverable in Markdown (## title, ### sections, tables allowed)")


RULES = """Rules you must follow:
- Use only the tools to obtain company data. Never invent figures. If a dataset is marked "demo": true, say the figures are illustrative demo data.
- Write in plain, confident British English. Lead with the insight, support it with evidence, end with a recommendation.
- You cannot send, publish, submit, sign, pay or contact anyone. If the request implies any of that, call request_external_action and say the action awaits approval.
- Everything you produce is a draft for the Managing Director's review."""


class AgentsSdkWorkforce:
    execution = "live"

    def __init__(self, store: Store, model: str | Model | None = None, embed=None) -> None:
        self.store = store
        self.model = model
        self.embed = embed
        cat = get_catalog()
        self.department_agents: dict[str, Agent[AgentContext]] = {}
        for a in cat.agents.values():
            datasets = ", ".join(DATA_ACCESS.get(a.id, [])) or "none"
            self.department_agents[a.id] = Agent[AgentContext](
                name=a.name,
                instructions=(
                    f"You are {a.name}, {a.role} at HN.CO, a boutique business intelligence, data analytics and digital "
                    f"transformation consultancy. {a.job_description}\nResponsibilities: {', '.join(a.responsibilities)}.\n"
                    f"Authorised datasets for your department: {datasets}.\n{RULES}"
                ),
                tools=TOOLS,
                model=model,
                model_settings=ModelSettings(),
            )
        roster = "\n".join(
            f"- {a.id}: {a.name} — {a.role}. {a.summary} Keywords: {', '.join(a.keywords[:8])}."
            for a in cat.agents.values()
            if a.id != "executive"
        )
        self.router = Agent[AgentContext](
            name="HN Executive AI",
            instructions=(
                "You are HN Executive AI, the central orchestrator of HN.CO's AI workforce. Decide which department agent "
                "should lead a request from the Managing Director and which (at most two) should support. "
                f"Use only these agent ids:\n{roster}\n"
                "Also state any external action implied by the request (sending, publishing, submitting, signing, paying, "
                "contacting clients), or null."
            ),
            output_type=RoutingOutput,
            model=model,
        )

    def _ctx(self, agent_id: str, hooks: WorkHooks | None = None) -> AgentContext:
        return AgentContext(agent_id=agent_id, store=self.store, hooks=hooks, embed=self.embed)

    async def route(self, text: str) -> tuple[RoutingDecision, str | None]:
        result = await Runner.run(self.router, text, context=self._ctx("executive"), max_turns=3)
        out: RoutingOutput = result.final_output
        valid = set(get_catalog().agents) - {"executive"}
        if out.assignee not in valid:
            log.warning("router returned unknown assignee %r; falling back to keyword routing", out.assignee)
            return route_by_keywords(text), out.external_action
        collaborators = [c for c in out.collaborators if c in valid and c != out.assignee][:2]
        return RoutingDecision(out.assignee, collaborators, out.reason), out.external_action

    async def produce(self, task: Task, hooks: WorkHooks) -> TaskResult:
        cat = get_catalog()
        agent = self.department_agents[task.assignee].clone(output_type=DeliverableOutput)
        support = ""
        if task.collaborators:
            support = "Supporting departments: " + ", ".join(cat.name(c) for c in task.collaborators) + ". Reflect their perspective.\n"
        prompt = (
            f"Request from the Managing Director, routed to you by HN Executive AI:\n{task.description}\n\n{support}"
            "Gather the evidence you need with the tools, then produce the deliverable."
        )
        await hooks.on_progress(f"Reviewing the request — {task.title}", 15)
        result = await Runner.run(agent, prompt, context=self._ctx(task.assignee, hooks), max_turns=12)
        out: DeliverableOutput = result.final_output
        return TaskResult(summary=out.summary, body=out.body_markdown)

    async def reply(self, agent_id: str, history: list[ChatMessage], text: str, state: AgentState, open_tasks: list[Task]) -> str:
        mine = [t for t in open_tasks if t.assignee == agent_id or agent_id in t.collaborators]
        situation = (
            f"Your current activity: {state.task_label} (status: {state.status}). "
            f"Your open tasks: {', '.join(f'{t.title} ({t.status}, {round(t.progress)}%)' for t in mine) or 'none'}."
        )
        agent = self.department_agents[agent_id].clone(
            instructions=self.department_agents[agent_id].instructions
            + "\nYou are chatting with the Managing Director. Be concise (under 150 words). "
            + "If they ask for a deliverable, suggest assigning it as a task so it is tracked and approved.\n"
            + situation
        )
        items: list[Any] = [{"role": "user" if m.role == "user" else "assistant", "content": m.content} for m in history[-10:]]
        items.append({"role": "user", "content": text})
        result = await Runner.run(agent, items, context=self._ctx(agent_id), max_turns=6)
        return str(result.final_output)
