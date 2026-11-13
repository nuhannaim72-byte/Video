"""HN.CO Intelligence Hub API.

Run locally:  uvicorn app.main:app --reload --port 8000
The web app reaches it through its same-origin proxy (/api/hub/*), so no keys reach the browser.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, StreamingResponse

from .auth import User, current_user, require
from .catalog import get_catalog
from .config import Settings, get_settings
from .events import EventBus
from .models import ChatBody, DecisionBody, SubmitTaskBody
from .orchestrator import Conflict, NotFound, Orchestrator
from .storage import ArtifactStorage
from .store import create_store

log = logging.getLogger("hnco")


def build_workforce(settings: Settings, store, model_override=None):
    """Live OpenAI agents when a key (or a test model) is provided, otherwise the simulated workforce."""
    if settings.openai_api_key or model_override is not None:
        from agents import set_default_openai_key, set_tracing_disabled

        from .workforce.llm import AgentsSdkWorkforce

        # Traces would send prompts and outputs to OpenAI's tracing service; keep them off.
        set_tracing_disabled(True)
        embed = None
        if settings.openai_api_key:
            set_default_openai_key(settings.openai_api_key)
            from openai import AsyncOpenAI

            client = AsyncOpenAI(api_key=settings.openai_api_key)

            async def embed(text: str) -> list[float] | None:
                try:
                    res = await client.embeddings.create(model=settings.embedding_model, input=text)
                    return res.data[0].embedding
                except Exception:  # knowledge search degrades to text matching
                    log.warning("embedding failed", exc_info=True)
                    return None

        return AgentsSdkWorkforce(store, model=model_override or settings.openai_model, embed=embed)
    from .workforce.simulated import SimulatedWorkforce

    return SimulatedWorkforce(pace=settings.simulated_pace)


def create_app(settings: Settings | None = None, model_override=None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store = create_store(settings.database_url)
        await store.init()
        storage = ArtifactStorage(settings)
        await storage.init()
        bus = EventBus()
        orch = Orchestrator(settings, store, bus, storage, build_workforce(settings, store, model_override))
        await orch.start()
        app.state.store, app.state.storage, app.state.bus, app.state.orch = store, storage, bus, orch
        log.info(
            "HN.CO hub ready: execution=%s auth=%s store=%s storage=%s",
            orch.execution,
            settings.auth_mode,
            type(store).__name__,
            storage.backend,
        )
        yield
        await orch.stop()
        await storage.close()
        await store.close()

    app = FastAPI(title="HN.CO Intelligence Hub API", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )

    def orch(request: Request) -> Orchestrator:
        return request.app.state.orch

    @app.exception_handler(NotFound)
    async def _nf(_: Request, exc: NotFound):
        return PlainTextResponse(f"Not found: {exc}", status_code=404)

    @app.exception_handler(Conflict)
    async def _cf(_: Request, exc: Conflict):
        return PlainTextResponse(str(exc), status_code=409)

    @app.get("/api/health")
    async def health(request: Request):
        o: Orchestrator = request.app.state.orch
        return {
            "status": "ok",
            "execution": o.execution,
            "auth": settings.auth_mode,
            "model": settings.openai_model if o.execution == "live" else None,
            "store": type(request.app.state.store).__name__,
            "storage": request.app.state.storage.backend,
        }

    @app.get("/api/me")
    async def me(user: User = Depends(current_user)):
        return {"id": user.id, "name": user.name, "roles": user.roles, "dev": user.dev}

    @app.get("/api/catalog")
    async def catalog(_: User = Depends(current_user)):
        c = get_catalog()
        return {"company": c.company, "departments": list(c.departments.values()), "agents": [a.__dict__ for a in c.agents.values()]}

    @app.get("/api/state")
    async def state(o: Orchestrator = Depends(orch), _: User = Depends(current_user)):
        return await o.snapshot()

    @app.get("/api/events")
    async def events(request: Request, o: Orchestrator = Depends(orch), _: User = Depends(current_user)):
        """Server-Sent Events: a snapshot first, then every change as it happens."""
        stream = request.app.state.bus.subscribe(first=await o.snapshot())
        return StreamingResponse(
            stream,
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
        )

    @app.post("/api/tasks", status_code=202)
    async def submit_task(body: SubmitTaskBody, o: Orchestrator = Depends(orch), user: User = Depends(require("assign"))):
        task = await o.submit(body, user)
        return task.dump()

    @app.get("/api/tasks/{task_id}")
    async def get_task(task_id: str, request: Request, _: User = Depends(current_user)):
        t = await request.app.state.store.get_task(task_id)
        if not t:
            raise HTTPException(404, "Task not found")
        return t.dump()

    @app.get("/api/tasks/{task_id}/artifact", response_class=PlainTextResponse)
    async def get_artifact(task_id: str, request: Request, _: User = Depends(current_user)):
        t = await request.app.state.store.get_task(task_id)
        if not t or not t.result or not t.result.artifact_url:
            raise HTTPException(404, "No artefact for this task")
        content = await request.app.state.storage.get_text(t.result.artifact_url)
        if content is None:
            raise HTTPException(404, "Artefact missing")
        return PlainTextResponse(content, media_type="text/markdown")

    @app.post("/api/agents/{agent_id}/chat")
    async def chat(agent_id: str, body: ChatBody, o: Orchestrator = Depends(orch), user: User = Depends(require("chat"))):
        reply = await o.chat(agent_id, body.message, user)
        return reply.dump()

    @app.post("/api/agents/{agent_id}/resolve")
    async def resolve(agent_id: str, o: Orchestrator = Depends(orch), user: User = Depends(require("resolve"))):
        await o.resolve(agent_id, user)
        return {"ok": True}

    @app.post("/api/approvals/{approval_id}/decision")
    async def decide(approval_id: str, body: DecisionBody, o: Orchestrator = Depends(orch), user: User = Depends(require("approve"))):
        ap = await o.decide(approval_id, body.decision, body.note, user)
        return ap.dump()

    @app.get("/api/audit")
    async def audit(request: Request, limit: int = 200, _: User = Depends(require("audit"))):
        return [a.dump() for a in await request.app.state.store.list_audit(min(limit, 1000))]

    return app


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
app = create_app()
