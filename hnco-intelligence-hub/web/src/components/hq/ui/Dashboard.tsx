"use client";

import { ArrowLeft, Check, FileText, RotateCcw, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { agentById, agents, departments, STATUS_META } from "@/lib/catalog";
import { hub } from "@/lib/client";
import { OPEN_TASK, selectPendingApprovals, useHub } from "@/lib/store";
import type { Approval } from "@/lib/types";
import { TaskDetail, TaskRow } from "./AgentPanel";
import { Button, cx, ExecutionTag, ProgressBar, SectionTitle, StatusDot, timeAgo } from "./primitives";
import { RequestForm } from "./TaskComposer";
import { notify } from "./Toasts";

function Kpi({ label, value, tone, sub }: { label: string; value: string | number; tone?: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3.5">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-mist">{label}</div>
      <div className="mt-1.5 font-display text-[32px] leading-none" style={{ color: tone ?? "#f0f2f4" }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px] text-mist">{sub}</div>}
    </div>
  );
}

function ApprovalCard({ a, onOpen }: { a: Approval; onOpen: () => void }) {
  const task = useHub((s) => s.tasks[a.taskId]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const decide = async (d: "approve" | "reject" | "revise") => {
    setBusy(true);
    try {
      await hub().decide(a.id, d, note || undefined);
    } catch (e) {
      notify({ tone: "error", text: `Decision failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };
  const external = a.kind === "external_action";
  return (
    <div className={cx("rounded-xl border p-3.5", external ? "border-status-error/35 bg-status-error/[0.06]" : "border-gold/30 bg-gold/[0.05]")}>
      <div className="flex items-start gap-2">
        {external ? <ShieldAlert size={17} className="mt-0.5 text-[#ff8a8d]" /> : <FileText size={17} className="mt-0.5 text-gold" />}
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium leading-snug text-platinum">{a.title}</div>
          <div className="mt-0.5 text-[11px] text-mist">
            {external ? "External action — requires explicit approval" : "Deliverable review"} · via {agentById[a.requestedBy].name} · {timeAgo(a.createdAt)}
          </div>
        </div>
        <ExecutionTag execution={a.execution} />
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-platinum/80">{a.summary}</p>
      {task && (
        <button onClick={onOpen} className="mt-1 text-[12px] font-medium text-gold hover:underline">
          Open {task.result ? "the draft" : "the task"} →
        </button>
      )}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional note to the team"
        className="mt-2.5 w-full rounded-md border border-white/10 bg-black/25 px-2.5 py-1.5 text-[12px] text-platinum placeholder:text-mist/60 focus:border-gold/50 focus:outline-none"
      />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button variant="gold" className="!py-1 text-[12px]" onClick={() => decide("approve")} disabled={busy}>
          <Check size={13} /> Approve
        </Button>
        {!external && (
          <Button variant="outline" className="!py-1 text-[12px]" onClick={() => decide("revise")} disabled={busy}>
            <RotateCcw size={13} /> Request changes
          </Button>
        )}
        <Button variant="danger" className="!py-1 text-[12px]" onClick={() => decide("reject")} disabled={busy}>
          <X size={13} /> Reject
        </Button>
      </div>
    </div>
  );
}

export function Dashboard() {
  const open = useHub((s) => s.dashboardOpen);
  const set = useHub((s) => s.set);
  const states = useHub((s) => s.agents);
  const tasks = useHub((s) => s.tasks);
  const approvalsMap = useHub((s) => s.approvals);
  const activity = useHub((s) => s.activity);
  const openTaskId = useHub((s) => s.openTaskId);
  const execution = useHub((s) => s.execution);
  const connection = useHub((s) => s.connection);
  const flyToZone = useHub((s) => s.flyToZone);
  const select = useHub((s) => s.select);

  const approvals = useMemo(() => selectPendingApprovals({ approvals: approvalsMap }), [approvalsMap]);
  const taskList = useMemo(() => Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt), [tasks]);
  const openTasks = taskList.filter((t) => OPEN_TASK.includes(t.status) && t.status !== "awaiting_approval");
  const completed = taskList.filter((t) => t.status === "completed").length;
  const active = Object.values(states).filter((s) => s.status !== "idle").length;
  const errors = Object.values(states).filter((s) => s.status === "error").length;

  if (!open) return null;
  const detail = openTaskId ? tasks[openTaskId] : null;
  const live = connection === "connected" ? execution : "simulated";

  return (
    <section
      className="panel pointer-events-auto absolute inset-2 z-40 flex flex-col overflow-hidden rounded-xl md:bottom-3 md:left-3 md:right-3 md:top-[76px]"
      aria-label="Managing Director dashboard"
    >
      <header className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
        {detail ? (
          <button onClick={() => set({ openTaskId: null })} className="rounded-md p-1 text-platinum/70 hover:bg-white/5" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-gold">Managing Director</div>
          <h2 className="truncate font-display text-[26px] leading-tight text-platinum">{detail ? detail.title : "Control Centre"}</h2>
        </div>
        <span className="hidden text-[11.5px] text-mist md:inline">
          {live === "live" ? "Live agent execution" : "Agent work shown is simulated"}
        </span>
        <ExecutionTag execution={live} />
        <button onClick={() => set({ dashboardOpen: false, openTaskId: null })} className="rounded-md p-1.5 text-platinum/70 hover:bg-white/5" aria-label="Close dashboard">
          <X size={19} />
        </button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
        {detail ? (
          <div className="mx-auto max-w-3xl">
            {approvals
              .filter((a) => a.taskId === detail.id)
              .map((a) => (
                <div key={a.id} className="mb-4">
                  <ApprovalCard a={a} onOpen={() => {}} />
                </div>
              ))}
            <TaskDetail task={detail} />
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
            <div className="space-y-4 xl:col-span-2">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                <Kpi label="AI employees" value={agents.length} sub="12 departments" />
                <Kpi label="Active agents" value={active} tone="#3fb27f" sub={`${agents.length - active} idle`} />
                <Kpi label="Pending tasks" value={openTasks.length} tone="#4c8dff" sub="routing · queued · in progress" />
                <Kpi label="Completed" value={completed} sub="tasks closed" />
                <Kpi label="Approvals" value={approvals.length} tone="#c4a66a" sub="awaiting your decision" />
                <Kpi label="Attention" value={errors} tone={errors ? "#e5484d" : undefined} sub="errors to resolve" />
              </div>
            </div>

            <div className="space-y-4">
              <section>
                <SectionTitle aside={<span className="text-[11px] text-mist">Nothing external runs without you</span>}>Approval requests</SectionTitle>
                <div className="space-y-2.5">
                  {approvals.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-4 text-[12.5px] text-mist">No approvals waiting.</p>}
                  {approvals.map((a) => (
                    <ApprovalCard key={a.id} a={a} onOpen={() => set({ openTaskId: a.taskId })} />
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-white/[0.07] bg-black/15 p-3.5">
                <SectionTitle>New request to HN Executive AI</SectionTitle>
                <RequestForm />
              </section>

              <section>
                <SectionTitle>Current work</SectionTitle>
                <div className="space-y-2">
                  {taskList.slice(0, 8).map((t) => (
                    <TaskRow key={t.id} task={t} onOpen={() => set({ openTaskId: t.id })} />
                  ))}
                </div>
              </section>
            </div>

            <div className="space-y-4">
              <section>
                <SectionTitle>Department overview</SectionTitle>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {departments.map((d) => {
                    const st = states[d.id];
                    const open = taskList.filter((t) => (t.assignee === d.id || t.collaborators.includes(d.id)) && OPEN_TASK.includes(t.status)).length;
                    const op = st?.status === "error" ? "Attention" : open > 0 ? "Busy" : "Operational";
                    return (
                      <button
                        key={d.id}
                        onClick={() => {
                          set({ dashboardOpen: false });
                          flyToZone(d.id);
                          select(d.id);
                        }}
                        className="rounded-lg border border-white/[0.07] bg-black/20 p-2.5 text-left hover:border-gold/35"
                      >
                        <div className="flex items-center gap-2">
                          <StatusDot status={st?.status ?? "idle"} />
                          <span className="flex-1 truncate text-[12.5px] font-medium text-platinum">{d.name}</span>
                          <span
                            className="rounded px-1.5 py-px text-[10px]"
                            style={{
                              color: op === "Attention" ? "#ff8a8d" : op === "Busy" ? "#8fb4ff" : "#7fd6ae",
                              background: op === "Attention" ? "#e5484d1f" : op === "Busy" ? "#4c8dff1f" : "#3fb27f1f",
                            }}
                          >
                            {op}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-[11px] text-mist">{st?.taskLabel}</div>
                        <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-mist">
                          <span style={{ color: STATUS_META[st?.status ?? "idle"].color }}>{STATUS_META[st?.status ?? "idle"].label}</span>
                          <span>· {open} open</span>
                          <span className="ml-auto">{agentById[d.id].kpis[0].label}: {agentById[d.id].kpis[0].value}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <SectionTitle aside={<span className="text-[10px] text-mist">illustrative</span>}>Client projects</SectionTitle>
                <div className="space-y-2 rounded-xl border border-white/[0.07] bg-black/15 p-3">
                  {agents
                    .flatMap((a) => a.projects.map((p) => ({ ...p, owner: a.name })))
                    .filter((p) => !p.client.includes("internal"))
                    .slice(0, 8)
                    .map((p) => (
                      <div key={p.name}>
                        <div className="flex justify-between text-[12px]">
                          <span className="text-platinum">{p.name}</span>
                          <span className="text-mist">{p.progress}%</span>
                        </div>
                        <div className="mb-1 text-[10.5px] text-mist">
                          {p.client} · {p.owner}
                        </div>
                        <ProgressBar value={p.progress} />
                      </div>
                    ))}
                </div>
              </section>

              <section>
                <SectionTitle>Recent company activity</SectionTitle>
                <ol className="space-y-2">
                  {activity.slice(0, 14).map((a) => (
                    <li key={a.id} className="flex gap-2 text-[12px] leading-snug">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.kind === "error" ? "#e5484d" : a.kind === "approval" ? "#c4a66a" : "#52647d" }} />
                      <span className="flex-1 text-platinum/85">{a.message}</span>
                      <span className="shrink-0 text-[10.5px] text-mist">{timeAgo(a.ts)}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
