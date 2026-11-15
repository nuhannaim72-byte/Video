// Smoke test for the local simulator: npx tsx src/lib/sim/simulator.smoke.ts
import { LocalSimulator } from "./simulator";
import type { HubEvent, Task, Approval } from "../types";

const tasks = new Map<string, Task>();
const approvals = new Map<string, Approval>();
const statuses = new Map<string, string>();
const log: string[] = [];
const sim = new LocalSimulator((e: HubEvent) => {
  if (e.type === "task.updated") tasks.set(e.task.id, e.task);
  if (e.type === "approval.updated") approvals.set(e.approval.id, e.approval);
  if (e.type === "activity") log.push(e.entry.message);
  if (e.type === "agent.updated") {
    const key = `${e.agent.id}:${e.agent.status}`;
    if (!statuses.has(key)) statuses.set(key, e.agent.taskLabel);
  }
});
sim.start();
sim.setSpeed(40);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fail = (m: string) => { console.error("FAIL:", m); process.exit(1); };

(async () => {
  await sim.submitTask({ description: "Prepare a financial performance report.", requestedBy: "Managing Director" });
  await sim.submitTask({ description: "Draft the tender proposal and send it to the prospect", requestedBy: "Managing Director" });
  const t0 = Date.now();
  let fin: Task | undefined, bd: Task | undefined;
  while (Date.now() - t0 < 15000) {
    await wait(200);
    fin = [...tasks.values()].find((t) => t.title.startsWith("Prepare a financial"));
    bd = [...tasks.values()].find((t) => t.title.startsWith("Draft the tender"));
    if (fin?.status === "awaiting_approval" && bd?.status === "awaiting_approval") break;
  }
  if (!fin || fin.assignee !== "finance") fail(`finance routing: ${fin?.assignee}`);
  if (!bd || bd.assignee !== "bizdev") fail(`bizdev routing: ${bd?.assignee}`);
  if (fin!.status !== "awaiting_approval") fail(`finance status ${fin!.status}`);
  if (bd!.externalAction == null) fail("external action not detected");
  console.log("finance:", fin!.status, Math.round(fin!.progress) + "%", "| steps:", fin!.steps.map((s) => s.text).join(" → "));
  console.log("bizdev:", bd!.status, "external:", bd!.externalAction, "collab:", bd!.collaborators);

  const pendingFor = (taskId: string) => [...approvals.values()].find((a) => a.taskId === taskId && a.status === "pending");
  await sim.decide(pendingFor(fin!.id)!.id, "approve");
  if (tasks.get(fin!.id)!.status !== "completed") fail("finance not completed after approval");

  await sim.decide(pendingFor(bd!.id)!.id, "approve");
  const ext = pendingFor(bd!.id);
  if (!ext || ext.kind !== "external_action") fail("external action approval missing");
  if (tasks.get(bd!.id)!.status === "completed") fail("completed before external approval");
  await sim.decide(ext!.id, "approve");
  if (tasks.get(bd!.id)!.status !== "completed") fail("bizdev not completed");
  console.log("bizdev final step:", tasks.get(bd!.id)!.steps.at(-2)!.text);
  console.log("statuses seen:", [...new Set([...statuses.keys()].map((k) => k.split(":")[1]))].join(", "));
  console.log("activity sample:", log.slice(0, 6));
  sim.stop();
  console.log("OK");
  process.exit(0);
})();
