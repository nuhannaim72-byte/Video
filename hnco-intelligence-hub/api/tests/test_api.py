"""End-to-end API tests. Run: .venv/bin/pytest -q"""

from __future__ import annotations

import json
import time
from pathlib import Path

import jwt
import pytest
from agents.testing import ModelStep, ScriptedModel, assistant_message, function_call
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth
from app.config import Settings
from app.main import create_app
from app.routing import detect_external_action, route_by_keywords


def make_settings(tmp_path: Path, **kw) -> Settings:
    base = dict(environment="test", simulated_pace=0, ambient_presence=False, database_url=None, local_artifact_dir=tmp_path / "artifacts")
    base.update(kw)
    return Settings(**base)


def wait_for(client: TestClient, predicate, timeout: float = 10.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        state = client.get("/api/state").json()
        found = predicate(state)
        if found:
            return found, state
        time.sleep(0.05)
    raise AssertionError("condition not met in time")


def pending_for(state, task_id):
    return next((a for a in state["approvals"] if a["taskId"] == task_id and a["status"] == "pending"), None)


# --- Routing ------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Prepare a financial performance report.", "finance"),
        ("Build a Power BI dashboard for client churn analysis", "bi"),
        ("Plan the ERP migration timeline with milestones", "project"),
        ("Review the supplier NDA for GDPR risks", "legal"),
        ("Design an ETL pipeline into the lakehouse", "dataeng"),
    ],
)
def test_keyword_routing(text, expected):
    assert route_by_keywords(text).assignee == expected


def test_external_action_detection():
    assert detect_external_action("Draft the proposal and send it to the prospect") is not None
    assert detect_external_action("Publish the LinkedIn post") == "Publish externally"
    assert detect_external_action("Prepare a financial performance report") is None


# --- Simulated end-to-end flow -------------------------------------------------------------------


def test_simulated_financial_report_flow(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as client:
        health = client.get("/api/health").json()
        assert health["execution"] == "simulated" and health["auth"] == "dev"

        task = client.post("/api/tasks", json={"description": "Prepare a financial performance report."}).json()
        ap, state = wait_for(client, lambda s: pending_for(s, task["id"]))
        t = next(x for x in state["tasks"] if x["id"] == task["id"])
        assert t["assignee"] == "finance"
        assert t["status"] == "awaiting_approval"
        assert t["execution"] == "simulated"
        assert "Simulated draft" in t["result"]["body"]
        assert ap["kind"] == "deliverable_review"
        # HN Executive AI is GOLD while the Managing Director has something to review.
        assert next(a for a in state["agents"] if a["id"] == "executive")["status"] == "waiting"

        artifact = client.get(f"/api/tasks/{task['id']}/artifact")
        assert artifact.status_code == 200 and t["title"] in artifact.text

        r = client.post(f"/api/approvals/{ap['id']}/decision", json={"decision": "approve"})
        assert r.status_code == 200
        done = client.get(f"/api/tasks/{task['id']}").json()
        assert done["status"] == "completed"
        # Deciding twice is refused.
        assert client.post(f"/api/approvals/{ap['id']}/decision", json={"decision": "approve"}).status_code == 409

        audit = client.get("/api/audit").json()
        actions = {a["action"] for a in audit}
        assert {"task.submit", "task.routed", "approval.approve"} <= actions


def test_external_action_needs_second_approval(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as client:
        task = client.post("/api/tasks", json={"description": "Draft the analytics tender proposal and send it to the prospect."}).json()
        ap, _ = wait_for(client, lambda s: pending_for(s, task["id"]))
        client.post(f"/api/approvals/{ap['id']}/decision", json={"decision": "approve"})
        ext, _ = wait_for(client, lambda s: pending_for(s, task["id"]))
        assert ext["kind"] == "external_action"
        assert client.get(f"/api/tasks/{task['id']}").json()["status"] == "awaiting_approval"
        client.post(f"/api/approvals/{ext['id']}/decision", json={"decision": "approve"})
        final = client.get(f"/api/tasks/{task['id']}").json()
        assert final["status"] == "completed"
        assert any("recorded but not executed" in s["text"] for s in final["steps"])


def test_revision_and_rejection(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as client:
        task = client.post("/api/tasks", json={"description": "Analyse churn KPIs for the healthcare client"}).json()
        ap, _ = wait_for(client, lambda s: pending_for(s, task["id"]))
        client.post(f"/api/approvals/{ap['id']}/decision", json={"decision": "revise", "note": "Add a segment view"})
        ap2, _ = wait_for(client, lambda s: pending_for(s, task["id"]))
        assert ap2["id"] != ap["id"]
        assert "Add a segment view" in client.get(f"/api/tasks/{task['id']}").json()["description"]
        client.post(f"/api/approvals/{ap2['id']}/decision", json={"decision": "reject"})
        assert client.get(f"/api/tasks/{task['id']}").json()["status"] == "rejected"


def test_chat_is_labelled_simulated(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as client:
        reply = client.post("/api/agents/finance/chat", json={"message": "What are you working on?"}).json()
        assert reply["role"] == "agent" and reply["execution"] == "simulated"
        assert "Simulated response" in reply["content"]
        assert client.post("/api/agents/nobody/chat", json={"message": "hi"}).status_code == 404


def test_event_stream_starts_with_snapshot(tmp_path):
    app = create_app(make_settings(tmp_path))
    with TestClient(app) as client, client.stream("GET", "/api/events") as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        for line in r.iter_lines():
            if line.startswith("data:"):
                event = json.loads(line[5:])
                assert event["type"] == "snapshot"
                assert len(event["agents"]) == 12
                break


# --- Live path through the OpenAI Agents SDK (deterministic scripted model) ----------------------


def scripted_model() -> ScriptedModel:
    def respond(call):
        instructions = call.system_instructions or ""
        items = call.input if isinstance(call.input, list) else []
        tool_outputs = [i for i in items if isinstance(i, dict) and i.get("type") == "function_call_output"]
        if "central orchestrator" in instructions:
            return [
                assistant_message(
                    json.dumps(
                        {"assignee": "finance", "collaborators": ["bi"], "reason": "Financial reporting request.", "external_action": None}
                    )
                )
            ]
        if "HN Finance AI" in instructions and not tool_outputs:
            return [
                function_call("query_company_data", {"dataset": "finance.monthly_pnl"}, call_id="c1"),
                function_call("query_company_data", {"dataset": "people.headcount"}, call_id="c2"),
            ]
        if "HN Finance AI" in instructions:
            outputs = " ".join(str(o.get("output")) for o in tool_outputs)
            assert "BI & Analytics" in outputs  # authorised data was read
            assert "Access denied" in outputs  # unauthorised data was refused
            return [
                assistant_message(
                    json.dumps(
                        {
                            "summary": "Q3 revenue up 4.1% (demo data).",
                            "body_markdown": "## Financial performance\n\nRevenue grew (illustrative demo data).",
                        }
                    )
                )
            ]
        return [assistant_message("Hello from a live agent.")]

    return ScriptedModel([ModelStep.respond(respond) for _ in range(40)])


def test_live_agents_sdk_path(tmp_path):
    model = scripted_model()
    app = create_app(make_settings(tmp_path), model_override=model)
    with TestClient(app) as client:
        assert client.get("/api/health").json()["execution"] == "live"
        task = client.post("/api/tasks", json={"description": "Prepare a financial performance report."}).json()
        _ap, state = wait_for(client, lambda s: pending_for(s, task["id"]), timeout=20)
        t = next(x for x in state["tasks"] if x["id"] == task["id"])
        assert t["execution"] == "live"
        assert t["assignee"] == "finance" and t["collaborators"] == ["bi"]
        assert t["result"]["summary"].startswith("Q3 revenue")
        assert any("Financial reporting request." in s["text"] for s in t["steps"])
        reply = client.post("/api/agents/bi/chat", json={"message": "hello"}).json()
        assert reply["content"] == "Hello from a live agent." and reply["execution"] == "live"
        assert len(model.calls) >= 4


# --- Microsoft Entra ID tokens and roles ---------------------------------------------------------


class FakeJwks:
    def __init__(self, key):
        self.key = key

    def get_signing_key_from_jwt(self, token):
        return type("K", (), {"key": self.key})()


def test_entra_auth_and_roles(tmp_path, monkeypatch):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setattr(auth, "_jwks_client", lambda tenant: FakeJwks(private.public_key()))
    tenant = "11111111-2222-3333-4444-555555555555"
    settings = make_settings(tmp_path, auth_mode="entra", entra_tenant_id=tenant, entra_audiences=["api://hnco-hub"])

    def token(roles, aud="api://hnco-hub"):
        now = int(time.time())
        claims = {
            "iss": f"https://login.microsoftonline.com/{tenant}/v2.0",
            "aud": aud,
            "iat": now,
            "exp": now + 600,
            "oid": "u1",
            "name": "Test User",
            "roles": roles,
        }
        return {"Authorization": "Bearer " + jwt.encode(claims, private, algorithm="RS256")}

    app = create_app(settings)
    with TestClient(app) as client:
        assert client.get("/api/state").status_code == 401
        assert client.get("/api/state", headers=token(["Hub.Member"], aud="api://other")).status_code == 401
        assert client.get("/api/state", headers=token([])).status_code == 403
        member, director = token(["Hub.Member"]), token(["Hub.Director"])
        assert client.get("/api/me", headers=member).json()["roles"] == ["Hub.Member"]
        task = client.post("/api/tasks", json={"description": "Prepare a financial performance report."}, headers=member).json()
        ap, _ = wait_for(type("C", (), {"get": lambda self, p: client.get(p, headers=member)})(), lambda s: pending_for(s, task["id"]))
        assert client.post(f"/api/approvals/{ap['id']}/decision", json={"decision": "approve"}, headers=member).status_code == 403
        assert client.get("/api/audit", headers=member).status_code == 403
        assert client.post(f"/api/approvals/{ap['id']}/decision", json={"decision": "approve"}, headers=director).status_code == 200
        audit = client.get("/api/audit", headers=director).json()
        assert any(a["action"] == "approval.approve" and a["actor"] == "Test User" for a in audit)


def test_production_refuses_dev_auth(tmp_path):
    with pytest.raises(ValueError):
        make_settings(tmp_path, environment="production", auth_mode="dev")
