import { agentById, agentIds, agents } from "../catalog";
import { BOARDROOM_SEATS, BREAK_SPOTS } from "../floorplan";
import { isSettledAt } from "../presence";
import type {
  Activity,
  ActivityEntry,
  AgentId,
  AgentState,
  AgentStatus,
  Approval,
  HubEvent,
  Task,
  TaskStep,
} from "../types";
import { chatReply, draftResult, SIMULATED_CHAT_SUFFIX, WORK_PHASES } from "./content";
import { deriveTitle, detectExternalAction, routeRequest } from "./router";
import type { HubClient, SubmitInput } from "../client";

/**
 * In-browser stand-in for the HN.CO central orchestrator. Everything it produces is tagged
 * `execution: "simulated"`. It speaks the same event protocol as the FastAPI backend.
 */

type Step = {
  activity: Activity;
  status: AgentStatus;
  label: string;
  duration: number; // simulated seconds
  settleAt?: string; // spot key the agent must reach before the clock starts
  progressTo?: number;
};

type Runner = {
  taskId: string;
  agent: AgentId;
  role: "assignee" | "collaborator" | "router";
  steps: Step[];
  i: number;
  started: number | null; // sim time the current step's clock started
  onDone?: () => void;
  /** Router only: the executive's state to restore if it was busy with something else. */
  restore?: AgentState;
};

type Mode = "ambient" | "task" | "meeting" | "error";

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const choice = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

const MEETING_TOPICS = [
  "Weekly delivery sync",
  "Pipeline review",
  "Client portfolio review",
  "Data platform roadmap",
  "Quarterly planning",
  "Risk & compliance check-in",
];
const ERRORS: Partial<Record<AgentId, string[]>> = {
  dataeng: ["Nightly ETL 'crm_daily' failed — source timeout", "Data quality rule breached on finance_gl"],
  technology: ["Automation 'invoice_intake' stopped — API credentials expired", "Monitoring alert: integration queue backlog"],
  bi: ["Dataset refresh failed — gateway offline"],
};

export class LocalSimulator implements HubClient {
  private emit: (e: HubEvent) => void;
  private agents = new Map<AgentId, AgentState>();
  private mode = new Map<AgentId, Mode>();
  private ambientUntil = new Map<AgentId, number>();
  private tasks = new Map<string, Task>();
  private approvals = new Map<string, Approval>();
  private runners: Runner[] = [];
  private queue = new Map<AgentId, Runner[]>();
  private simTime = 0;
  private speed = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastReal = 0;
  private nextMeeting = 60;
  private meetingEnds = 0;
  /** A meeting's clock only starts once the presenter has reached the boardroom. */
  private meetingStarted = false;
  private meetingPresenter: AgentId | null = null;
  private meetingMembers: AgentId[] = [];
  private nextError = 150;
  private visitorHost = new Map<AgentId, AgentId>(); // host -> visitor
  private breakSpots = new Map<number, AgentId>();

  constructor(emit: (e: HubEvent) => void) {
    this.emit = emit;
  }

  // --- Lifecycle -------------------------------------------------------------------------------

  start() {
    const now = Date.now();
    for (const id of agentIds) {
      this.agents.set(id, { id, status: "working", activity: { kind: "desk" }, taskLabel: agentById[id].routine[0] });
      this.mode.set(id, "ambient");
      this.ambientUntil.set(id, rand(4, 30));
    }
    this.seedHistory(now);
    this.emit({
      type: "snapshot",
      agents: [...this.agents.values()],
      tasks: [...this.tasks.values()],
      approvals: [...this.approvals.values()],
      activity: [
        this.entry("system", "system", "Local simulation started. Agent work below is simulated, not real AI execution."),
      ],
      execution: "simulated",
    });
    for (const id of agentIds) this.chooseAmbient(id, true);
    this.refreshExecutive();
    this.lastReal = performance.now();
    this.timer = setInterval(() => this.tick(), 250);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setSpeed(n: number) {
    this.speed = n;
  }

  // --- Commands --------------------------------------------------------------------------------

  async submitTask(input: SubmitInput) {
    const text = input.description.trim();
    if (!text) return;
    const now = Date.now();
    const routing = routeRequest(text);
    const direct = input.target && input.target !== "executive" ? input.target : null;
    const assignee = direct ?? routing.assignee;
    const collaborators = direct ? routing.collaborators.filter((c) => c !== direct).slice(0, 1) : routing.collaborators;
    const task: Task = {
      id: uid("task"),
      title: input.title?.trim() || deriveTitle(text),
      description: text,
      requestedBy: input.requestedBy,
      assignee,
      collaborators,
      routedBy: "executive",
      status: "routing",
      progress: 0,
      createdAt: now,
      updatedAt: now,
      externalAction: detectExternalAction(text),
      result: null,
      steps: [{ ts: now, agentId: "user", text: `Request submitted by ${input.requestedBy}${input.via ? ` via ${input.via}` : ""}.` }],
      execution: "simulated",
    };
    this.tasks.set(task.id, task);
    this.emitTask(task);
    this.log("user", "task", `New request: "${task.title}"`, task.id);

    // Step 1: Executive AI routes the request.
    const exec = this.agents.get("executive")!;
    const router: Runner = {
      taskId: task.id,
      agent: "executive",
      role: "router",
      steps: [{ activity: exec.activity, status: "analysing", label: `Routing: ${task.title}`, duration: 3 }],
      i: 0,
      started: null,
      onDone: () => this.dispatch(task.id, direct ? "Direct assignment confirmed." : routing.reason),
      restore: { ...exec },
    };
    this.runners.push(router);
    this.applyStep(router);
  }

  async sendChat(agentId: AgentId, text: string) {
    const now = Date.now();
    this.emit({
      type: "chat.message",
      agentId,
      message: { id: uid("msg"), ts: now, role: "user", content: text, execution: "simulated" },
    });
    const delay = 700 + Math.random() * 1100;
    setTimeout(() => {
      const state = this.agents.get(agentId)!;
      const open = [...this.tasks.values()].filter((t) => !["completed", "rejected", "failed"].includes(t.status));
      const reply = chatReply(agentId, text, state, open);
      this.emit({
        type: "chat.message",
        agentId,
        message: {
          id: uid("msg"),
          ts: Date.now(),
          role: "agent",
          content: `${reply}\n\n_${SIMULATED_CHAT_SUFFIX}_`,
          execution: "simulated",
        },
      });
    }, delay);
  }

  async decide(approvalId: string, decision: "approve" | "reject" | "revise", note?: string) {
    const ap = this.approvals.get(approvalId);
    if (!ap || ap.status !== "pending") return;
    const task = this.tasks.get(ap.taskId);
    const now = Date.now();
    ap.status = decision === "approve" ? "approved" : "rejected";
    ap.decidedAt = now;
    ap.decidedBy = "Managing Director";
    ap.note = note;
    this.emit({ type: "approval.updated", approval: { ...ap } });
    if (!task) return;

    if (decision === "approve") {
      this.log("executive", "approval", `Managing Director approved "${ap.title}"`, task.id);
      if (ap.kind === "deliverable_review" && task.externalAction) {
        this.addStep(task, "executive", `Deliverable approved. External action needs separate approval: ${task.externalAction}.`);
        task.status = "awaiting_approval";
        this.emitTask(task);
        this.requestApproval(task, "external_action");
      } else {
        if (ap.kind === "external_action") {
          this.addStep(
            task,
            "executive",
            `External action approved: ${task.externalAction}. Simulation only — no real integration was called.`,
          );
        }
        task.status = "completed";
        task.progress = 100;
        this.addStep(task, "executive", "Task completed and filed.");
        this.emitTask(task);
      }
    } else if (decision === "revise") {
      this.log("executive", "approval", `Changes requested on "${task.title}"${note ? `: ${note}` : ""}`, task.id);
      this.addStep(task, "user", `Changes requested${note ? `: ${note}` : ""}.`);
      task.status = "queued";
      task.progress = 60;
      this.emitTask(task);
      this.enqueue(this.assigneeRunner(task, true));
    } else {
      this.log("executive", "approval", `Managing Director rejected "${task.title}"`, task.id);
      this.addStep(task, "user", `Rejected${note ? `: ${note}` : ""}.`);
      task.status = "rejected";
      this.emitTask(task);
    }
    this.refreshExecutive();
  }

  async resolveError(agentId: AgentId) {
    if (this.mode.get(agentId) !== "error") return;
    this.log(agentId, "status", `${agentById[agentId].name}: issue acknowledged by the Managing Director, retrying.`);
    this.mode.set(agentId, "ambient");
    this.setAgent(agentId, { status: "working", activity: { kind: "desk" }, taskLabel: "Retrying the failed job", error: undefined });
    this.ambientUntil.set(agentId, this.simTime + 12);
  }

  // --- Orchestration ---------------------------------------------------------------------------

  private dispatch(taskId: string, reason: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const a = agentById[task.assignee];
    this.addStep(task, "executive", `Routed to ${a.name}. ${reason}`);
    task.status = "queued";
    this.emitTask(task);
    this.log(
      "executive",
      "task",
      `Routed "${task.title}" to ${a.name}` +
        (task.collaborators.length ? ` with ${task.collaborators.map((c) => agentById[c].name).join(", ")}` : ""),
      task.id,
    );
    this.enqueue(this.assigneeRunner(task, false));
    task.collaborators.forEach((c) => this.enqueue(this.collaboratorRunner(task, c)));
    this.refreshExecutive();
  }

  private assigneeRunner(task: Task, revision: boolean): Runner {
    const id = task.assignee;
    const ph = WORK_PHASES[id];
    const desk = `${id}:desk`;
    const steps: Step[] = [];
    if (!revision) {
      steps.push({ activity: { kind: "desk" }, status: "analysing", label: `${ph.analyse} — ${task.title}`, duration: 9, settleAt: desk, progressTo: 25 });
      steps.push({ activity: { kind: "desk" }, status: "working", label: `${ph.work} — ${task.title}`, duration: 13, settleAt: desk, progressTo: 60 });
      const c0 = task.collaborators[0];
      if (c0) {
        steps.push({
          activity: { kind: "collaborate", withAgent: c0 },
          status: "working",
          label: `Aligning with ${agentById[c0].name} on ${task.title}`,
          duration: 8,
          settleAt: `${c0}:visitor`,
          progressTo: 72,
        });
      }
      steps.push({ activity: { kind: "desk" }, status: "working", label: `Finalising the ${ph.deliverable.toLowerCase()}`, duration: 10, settleAt: desk, progressTo: 94 });
    } else {
      steps.push({ activity: { kind: "desk" }, status: "working", label: `Revising — ${task.title}`, duration: 12, settleAt: desk, progressTo: 94 });
    }
    steps.push({
      activity: { kind: "handoff", withAgent: "executive" },
      status: "working",
      label: "Handing the draft to HN Executive AI",
      duration: 6,
      settleAt: "executive:visitor",
      progressTo: 100,
    });
    return {
      taskId: task.id,
      agent: id,
      role: "assignee",
      steps,
      i: 0,
      started: null,
      onDone: () => this.deliver(task.id),
    };
  }

  private collaboratorRunner(task: Task, c: AgentId): Runner {
    const lead = agentById[task.assignee].name;
    return {
      taskId: task.id,
      agent: c,
      role: "collaborator",
      steps: [
        { activity: { kind: "desk" }, status: "analysing", label: `Supporting ${lead}: ${task.title}`, duration: 7, settleAt: `${c}:desk` },
        { activity: { kind: "desk" }, status: "working", label: `Preparing input for ${lead}`, duration: 12, settleAt: `${c}:desk` },
      ],
      i: 0,
      started: null,
      onDone: () => {
        const t = this.tasks.get(task.id);
        if (t) {
          this.addStep(t, c, `${agentById[c].name} delivered input to ${lead}.`);
          this.emitTask(t);
        }
      },
    };
  }

  private deliver(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.result = draftResult(task);
    task.progress = 100;
    task.status = "awaiting_approval";
    this.addStep(task, task.assignee, `Draft sent to HN Executive AI.`);
    this.addStep(task, "executive", "Presented to the Managing Director for review.");
    this.emitTask(task);
    this.requestApproval(task, "deliverable_review");
    this.log(task.assignee, "task", `${agentById[task.assignee].name} delivered "${task.title}" to Executive AI`, task.id);
  }

  private requestApproval(task: Task, kind: Approval["kind"]) {
    const ap: Approval = {
      id: uid("appr"),
      taskId: task.id,
      kind,
      title: kind === "deliverable_review" ? `Review: ${task.title}` : `External action: ${task.externalAction}`,
      summary:
        kind === "deliverable_review"
          ? task.result?.summary ?? ""
          : `${agentById[task.assignee].name} requests permission to: ${task.externalAction?.toLowerCase()} for "${task.title}".`,
      requestedBy: "executive",
      status: "pending",
      createdAt: Date.now(),
      execution: "simulated",
    };
    this.approvals.set(ap.id, ap);
    this.emit({ type: "approval.updated", approval: { ...ap } });
    this.log("executive", "approval", `Approval requested: ${ap.title}`, task.id);
    this.refreshExecutive();
  }

  private enqueue(r: Runner) {
    const q = this.queue.get(r.agent) ?? [];
    q.push(r);
    this.queue.set(r.agent, q);
    if (!this.runners.some((x) => x.agent === r.agent && x.role !== "router")) this.startNext(r.agent);
  }

  private startNext(agent: AgentId) {
    const q = this.queue.get(agent);
    const r = q?.shift();
    if (!r) return false;
    if (this.mode.get(agent) === "meeting") this.leaveMeeting(agent);
    if (this.mode.get(agent) === "error") {
      // An agent with an open error still takes the task; the error stays visible in the feed.
      this.log(agent, "error", `${agentById[agent].name} parked an unresolved issue to start new work.`);
    }
    this.releaseSpots(agent);
    this.mode.set(agent, "task");
    this.runners.push(r);
    const task = this.tasks.get(r.taskId);
    if (task && r.role === "assignee" && task.status === "queued") {
      task.status = "in_progress";
      this.addStep(task, agent, `${agentById[agent].name} started work.`);
      this.emitTask(task);
    }
    this.applyStep(r);
    return true;
  }

  private applyStep(r: Runner) {
    const s = r.steps[r.i];
    r.started = s.settleAt ? null : this.simTime;
    if (s.activity.kind === "collaborate" && s.activity.withAgent) this.visitorHost.set(s.activity.withAgent, r.agent);
    this.setAgent(r.agent, {
      status: s.status,
      activity: s.activity,
      taskLabel: s.label,
      taskId: r.role === "router" ? undefined : r.taskId,
      progress: r.role === "assignee" ? this.tasks.get(r.taskId)?.progress : undefined,
    });
  }

  private applyStepKeepClock(r: Runner) {
    const s = r.steps[r.i];
    this.setAgent(r.agent, { status: s.status, activity: s.activity, taskLabel: s.label, taskId: r.taskId });
  }

  private advanceRunner(r: Runner, dt: number): boolean {
    const s = r.steps[r.i];
    if (r.started === null) {
      if (s.settleAt && !isSettledAt(r.agent, s.settleAt)) return false;
      r.started = this.simTime;
    }
    const t = Math.min(1, (this.simTime - r.started) / s.duration);
    if (r.role === "assignee" && s.progressTo !== undefined) {
      const task = this.tasks.get(r.taskId);
      if (task) {
        const from = r.i === 0 ? (task.status === "in_progress" && task.progress >= 60 ? 60 : 0) : r.steps[r.i - 1].progressTo ?? 0;
        const p = Math.max(task.progress, from + (s.progressTo - from) * t);
        if (Math.floor(p) !== Math.floor(task.progress)) {
          task.progress = p;
          task.updatedAt = Date.now();
          this.emitTask(task, false);
          const a = this.agents.get(r.agent)!;
          this.setAgent(r.agent, { ...a, progress: p });
        }
      }
    }
    void dt;
    if (t < 1) return false;
    if (s.activity.kind === "collaborate" && s.activity.withAgent) this.visitorHost.delete(s.activity.withAgent);
    r.i++;
    if (r.i < r.steps.length) {
      this.applyStep(r);
      return false;
    }
    return true;
  }

  // --- Ambient life ----------------------------------------------------------------------------

  private chooseAmbient(id: AgentId, initial = false) {
    const profile = agentById[id];
    const routine = choice(profile.routine);
    this.releaseSpots(id);
    const roll = Math.random() * 100;
    let next: Pick<AgentState, "status" | "activity" | "taskLabel">;
    let dur = rand(25, 50);
    if (initial || roll < 46) {
      next = { status: "working", activity: { kind: "desk" }, taskLabel: routine };
    } else if (roll < 58) {
      next = { status: "working", activity: { kind: "workstation" }, taskLabel: routine };
    } else if (roll < 68) {
      next = { status: "analysing", activity: { kind: "desk" }, taskLabel: `Analysing: ${routine.toLowerCase()}` };
    } else if (roll < 80 && id !== "executive") {
      const free = BREAK_SPOTS.map((_, i) => i).filter((i) => !this.breakSpots.has(i));
      if (free.length) {
        const seat = choice(free);
        this.breakSpots.set(seat, id);
        next = { status: "idle", activity: { kind: "break", seat }, taskLabel: "On a short break" };
        dur = rand(28, 45);
      } else {
        next = { status: "working", activity: { kind: "desk" }, taskLabel: routine };
      }
    } else if (roll < 91) {
      const hosts = agentIds.filter(
        (h) =>
          h !== id &&
          !this.visitorHost.has(h) &&
          this.mode.get(h) !== "meeting" &&
          ["desk"].includes(this.agents.get(h)?.activity.kind ?? ""),
      );
      if (hosts.length) {
        const host = choice(hosts);
        this.visitorHost.set(host, id);
        next = {
          status: "working",
          activity: { kind: "collaborate", withAgent: host },
          taskLabel: `Collaborating with ${agentById[host].name}`,
        };
        dur = rand(16, 26);
      } else {
        next = { status: "working", activity: { kind: "desk" }, taskLabel: routine };
      }
    } else {
      next = { status: "idle", activity: { kind: "idle" }, taskLabel: "Available" };
      dur = rand(14, 24);
    }
    this.mode.set(id, "ambient");
    this.ambientUntil.set(id, this.simTime + dur);
    this.setAgent(id, { ...next, taskId: undefined, progress: undefined, error: undefined });
    if (id === "executive") this.refreshExecutive();
  }

  private releaseSpots(id: AgentId) {
    for (const [seat, who] of this.breakSpots) if (who === id) this.breakSpots.delete(seat);
    for (const [host, who] of this.visitorHost) if (who === id) this.visitorHost.delete(host);
  }

  private maybeStartMeeting() {
    if (this.simTime < this.nextMeeting || this.meetingMembers.length) return;
    this.nextMeeting = this.simTime + rand(110, 170);
    const approvalsPending = [...this.approvals.values()].some((a) => a.status === "pending");
    // The Executive AI stays at its desk (GOLD) while work waits for the Managing Director.
    const free = agentIds.filter((id) => this.mode.get(id) === "ambient" && !(id === "executive" && approvalsPending));
    if (free.length < 3) return;
    const n = Math.min(free.length, 3 + Math.floor(Math.random() * 3));
    const members = [...free].sort(() => Math.random() - 0.5).slice(0, n);
    const topic = choice(MEETING_TOPICS);
    const seats = [...Array(BOARDROOM_SEATS).keys()].sort(() => Math.random() - 0.5);
    this.meetingMembers = members;
    this.meetingPresenter = members[0];
    this.meetingStarted = false;
    this.meetingEnds = this.simTime + 150; // upper bound if people never arrive
    members.forEach((id, i) => {
      this.releaseSpots(id);
      this.mode.set(id, "meeting");
      this.setAgent(id, {
        status: "working",
        activity: i === 0 ? { kind: "present" } : { kind: "meeting", seat: seats[i] },
        taskLabel: i === 0 ? `Presenting: ${topic}` : `In meeting: ${topic}`,
        taskId: undefined,
        progress: undefined,
      });
    });
    this.log(
      members[0],
      "movement",
      `${topic} in the Glass Boardroom — ${members.map((m) => agentById[m].name.replace("HN ", "")).join(", ")}`,
    );
  }

  private leaveMeeting(id: AgentId) {
    this.meetingMembers = this.meetingMembers.filter((m) => m !== id);
    this.mode.set(id, "ambient");
    // Without its presenter the meeting wraps up shortly.
    if (id === this.meetingPresenter && !this.meetingStarted) this.meetingEnds = Math.min(this.meetingEnds, this.simTime + 20);
  }

  private maybeRaiseError() {
    if (this.simTime < this.nextError) return;
    this.nextError = this.simTime + rand(170, 280);
    if ([...this.mode.values()].includes("error")) return;
    const candidates = (Object.keys(ERRORS) as AgentId[]).filter((id) => this.mode.get(id) === "ambient");
    if (!candidates.length) return;
    const id = choice(candidates);
    const msg = choice(ERRORS[id]!);
    this.releaseSpots(id);
    this.mode.set(id, "error");
    this.setAgent(id, { status: "error", activity: { kind: "desk" }, taskLabel: msg, error: msg, taskId: undefined, progress: undefined });
    this.log(id, "error", `${agentById[id].name}: ${msg}. Requires attention.`);
  }

  /** The Executive AI turns GOLD whenever work is waiting for the Managing Director. */
  private refreshExecutive() {
    const exec = this.agents.get("executive");
    if (!exec) return;
    const routing = this.runners.some((r) => r.agent === "executive");
    if (routing || this.mode.get("executive") !== "ambient") return;
    const pending = [...this.approvals.values()].filter((a) => a.status === "pending").length;
    if (pending > 0) {
      if (exec.status !== "waiting" || !exec.taskLabel.startsWith("Awaiting")) {
        this.setAgent("executive", {
          status: "waiting",
          activity: { kind: "desk" },
          taskLabel: `Awaiting Managing Director review (${pending})`,
          taskId: undefined,
        });
      } else if (!exec.taskLabel.includes(`(${pending})`)) {
        this.setAgent("executive", { ...exec, taskLabel: `Awaiting Managing Director review (${pending})` });
      }
    } else if (exec.status === "waiting") {
      this.chooseAmbient("executive", true);
    }
  }

  // --- Tick ------------------------------------------------------------------------------------

  private tick() {
    const nowReal = performance.now();
    const dt = Math.min(1, (nowReal - this.lastReal) / 1000) * this.speed;
    this.lastReal = nowReal;
    this.simTime += dt;

    // Task runners.
    for (const r of [...this.runners]) {
      if (this.advanceRunner(r, dt)) {
        this.runners = this.runners.filter((x) => x !== r);
        r.onDone?.();
        if (r.role === "router") {
          const m = this.mode.get("executive");
          const own = this.runners.find((x) => x.agent === "executive" && x.role !== "router");
          if (this.runners.some((x) => x.agent === "executive" && x.role === "router")) continue;
          if (m === "task" && own) this.applyStepKeepClock(own);
          else if ((m === "meeting" || m === "error") && r.restore) this.setAgent("executive", r.restore);
          else {
            this.refreshExecutive();
            if (this.agents.get("executive")!.status === "analysing") this.chooseAmbient("executive", true);
          }
          continue;
        }
        if (!this.startNext(r.agent)) {
          this.mode.set(r.agent, "ambient");
          this.chooseAmbient(r.agent, true);
        }
      }
    }

    // Meetings.
    if (
      this.meetingMembers.length &&
      !this.meetingStarted &&
      this.meetingPresenter &&
      this.meetingMembers.includes(this.meetingPresenter) &&
      isSettledAt(this.meetingPresenter, "boardroom:presenter")
    ) {
      this.meetingStarted = true;
      this.meetingEnds = this.simTime + rand(40, 55);
    }
    if (this.meetingMembers.length && this.simTime >= this.meetingEnds) {
      const members = this.meetingMembers;
      this.meetingMembers = [];
      members.forEach((id) => {
        if (this.mode.get(id) === "meeting") this.chooseAmbient(id, true);
      });
    }
    this.maybeStartMeeting();
    this.maybeRaiseError();

    // Ambient rotation.
    for (const id of agentIds) {
      if (this.mode.get(id) !== "ambient") continue;
      if (id === "executive" && this.agents.get(id)?.status === "waiting") continue;
      if (this.simTime >= (this.ambientUntil.get(id) ?? 0)) this.chooseAmbient(id);
    }
    // A visitor whose host left their desk goes back to work.
    for (const [host, visitor] of this.visitorHost) {
      const h = this.agents.get(host);
      const v = this.agents.get(visitor);
      if (this.mode.get(visitor) === "ambient" && h && h.activity.kind !== "desk" && v?.activity.kind === "collaborate") {
        this.chooseAmbient(visitor, true);
      }
    }
  }

  // --- Helpers ---------------------------------------------------------------------------------

  private setAgent(id: AgentId, patch: Partial<AgentState>) {
    const prev = this.agents.get(id)!;
    const next: AgentState = { ...prev, ...patch, id };
    this.agents.set(id, next);
    this.emit({ type: "agent.updated", agent: next });
  }

  private emitTask(task: Task, touch = true) {
    if (touch) task.updatedAt = Date.now();
    this.emit({ type: "task.updated", task: { ...task, steps: [...task.steps], collaborators: [...task.collaborators] } });
  }

  private addStep(task: Task, agentId: TaskStep["agentId"], text: string) {
    task.steps.push({ ts: Date.now(), agentId, text });
  }

  private entry(agentId: ActivityEntry["agentId"], kind: ActivityEntry["kind"], message: string, taskId?: string): ActivityEntry {
    return { id: uid("act"), ts: Date.now(), agentId, kind, message, taskId, execution: "simulated" };
  }

  private log(agentId: ActivityEntry["agentId"], kind: ActivityEntry["kind"], message: string, taskId?: string) {
    this.emit({ type: "activity", entry: this.entry(agentId, kind, message, taskId) });
  }

  /** A little history so the dashboard isn't empty on first load. All simulated. */
  private seedHistory(now: number) {
    const mk = (
      assignee: AgentId,
      title: string,
      status: Task["status"],
      ageMin: number,
      collaborators: AgentId[] = [],
      externalAction: string | null = null,
    ) => {
      const t: Task = {
        id: uid("task"),
        title,
        description: title,
        requestedBy: "Managing Director",
        assignee,
        collaborators,
        routedBy: "executive",
        status,
        progress: status === "completed" || status === "awaiting_approval" ? 100 : 0,
        createdAt: now - ageMin * 60_000,
        updatedAt: now - Math.max(1, ageMin - 20) * 60_000,
        externalAction,
        result: null,
        steps: [
          { ts: now - ageMin * 60_000, agentId: "user", text: "Request submitted by Managing Director." },
          { ts: now - ageMin * 60_000 + 3000, agentId: "executive", text: `Routed to ${agentById[assignee].name}.` },
        ],
        execution: "simulated",
      };
      if (status === "completed" || status === "awaiting_approval") t.result = draftResult(t);
      if (status === "completed") t.steps.push({ ts: t.updatedAt, agentId: "executive", text: "Approved by Managing Director. Task completed." });
      this.tasks.set(t.id, t);
      return t;
    };
    mk("bi", "Monthly KPI pack for the healthcare client", "completed", 340, ["dataeng"]);
    mk("finance", "Q3 management accounts", "completed", 280);
    mk("legal", "Review the updated supplier NDA", "completed", 190);
    const pending = mk("marketing", "LinkedIn campaign for the Data Maturity Index", "awaiting_approval", 45, ["strategy"], "Publish externally");
    const ap: Approval = {
      id: uid("appr"),
      taskId: pending.id,
      kind: "deliverable_review",
      title: `Review: ${pending.title}`,
      summary: pending.result!.summary,
      requestedBy: "executive",
      status: "pending",
      createdAt: now - 30 * 60_000,
      execution: "simulated",
    };
    this.approvals.set(ap.id, ap);
  }
}

export const allAgentProfiles = agents;
