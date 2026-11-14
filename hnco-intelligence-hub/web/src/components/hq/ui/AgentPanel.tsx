"use client";

import { AlertTriangle, Crosshair, MapPin, MessageSquare, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { agentById, concierge, departmentById, STATUS_META } from "@/lib/catalog";
import { hub } from "@/lib/client";
import { looksLikeTask } from "@/lib/sim/router";
import { OPEN_TASK, useHub } from "@/lib/store";
import type { AgentId, Task } from "@/lib/types";
import { Button, cx, ExecutionTag, Markdown, ProgressBar, SectionTitle, StatusPill, timeAgo } from "./primitives";
import { RequestForm } from "./TaskComposer";
import { notify } from "./Toasts";

type Tab = "overview" | "chat" | "tasks" | "activity";
const TAB_LABEL: Record<Tab, string> = { overview: "Overview", chat: "Chat", tasks: "Tasks", activity: "Activity" };

export function AgentPanel() {
  const selected = useHub((s) => s.selected);
  if (!selected) return null;
  return (
    <aside
      className="panel pointer-events-auto absolute inset-x-2 bottom-[70px] top-[34vh] z-30 flex flex-col overflow-hidden rounded-xl md:inset-x-auto md:bottom-3 md:right-3 md:top-[76px] md:w-[420px]"
      aria-label="Employee details"
    >
      {selected === "concierge" ? <ConciergeBody /> : <AgentBody id={selected} key={selected} />}
    </aside>
  );
}

function Header({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="border-b border-white/[0.07] px-4 pb-3 pt-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-gold">{subtitle}</div>
          <h2 className="mt-0.5 font-display text-[24px] leading-tight text-platinum">{title}</h2>
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-platinum/60 hover:bg-white/5 hover:text-platinum" aria-label="Close panel">
          <X size={18} />
        </button>
      </div>
      {children}
    </div>
  );
}

function AgentBody({ id }: { id: AgentId }) {
  const profile = agentById[id];
  const dept = departmentById[profile.department];
  const state = useHub((s) => s.agents[id]);
  const select = useHub((s) => s.select);
  const set = useHub((s) => s.set);
  const flyToZone = useHub((s) => s.flyToZone);
  const [tab, setTab] = useState<Tab>("overview");
  const tasks = useHub((s) => s.tasks);
  const mine = useMemo(
    () => Object.values(tasks).filter((t) => t.assignee === id || t.collaborators.includes(id)).sort((a, b) => b.createdAt - a.createdAt),
    [tasks, id],
  );
  const current = state?.taskId ? tasks[state.taskId] : undefined;

  return (
    <>
      <Header title={profile.name} subtitle={dept.name} onClose={() => select(null)}>
        <p className="mt-1 text-[12.5px] text-platinum/70">{profile.role}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {state && <StatusPill status={state.status} />}
          <Button variant="outline" className="!px-2 !py-1 text-[12px]" onClick={() => set({ cameraMode: "follow" })}>
            <Crosshair size={13} /> Follow
          </Button>
          <Button variant="outline" className="!px-2 !py-1 text-[12px]" onClick={() => flyToZone(profile.department)}>
            <MapPin size={13} /> Workstation
          </Button>
        </div>
      </Header>
      <nav className="flex border-b border-white/[0.07] px-2" role="tablist">
        {(["overview", "chat", "tasks", "activity"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cx(
              "relative px-3 py-2.5 text-[12.5px] transition-colors",
              tab === t ? "text-gold" : "text-platinum/65 hover:text-platinum",
            )}
          >
            {TAB_LABEL[t]}
            {t === "tasks" && mine.filter((m) => OPEN_TASK.includes(m.status)).length > 0 && (
              <span className="ml-1 rounded-full bg-gold/20 px-1.5 text-[10px] text-gold">{mine.filter((m) => OPEN_TASK.includes(m.status)).length}</span>
            )}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-gold" />}
          </button>
        ))}
      </nav>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        {tab === "overview" && <Overview id={id} current={current} />}
        {tab === "chat" && <Chat id={id} />}
        {tab === "tasks" && <Tasks id={id} tasks={mine} />}
        {tab === "activity" && <Activity id={id} />}
      </div>
    </>
  );
}

function Overview({ id, current }: { id: AgentId; current?: Task }) {
  const profile = agentById[id];
  const state = useHub((s) => s.agents[id]);
  const execution = useHub((s) => s.execution);
  const connection = useHub((s) => s.connection);
  const color = state ? STATUS_META[state.status].color : "#8b94a3";
  return (
    <div className="space-y-5 p-4">
      <section className="rounded-lg border border-white/[0.07] bg-black/20 p-3">
        <SectionTitle aside={<ExecutionTag execution={connection === "connected" ? execution : "simulated"} />}>Current task</SectionTitle>
        <p className="text-[14px] font-medium leading-snug text-platinum">{state?.taskLabel ?? "—"}</p>
        {current && (
          <div className="mt-2.5">
            <div className="mb-1 flex justify-between text-[11px] text-mist">
              <span>{current.title}</span>
              <span>{Math.round(current.progress)}%</span>
            </div>
            <ProgressBar value={current.progress} color={color} />
          </div>
        )}
        {state?.status === "error" && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-status-error/40 bg-status-error/10 p-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#ff8a8d]" />
            <div className="flex-1 text-[12.5px] text-platinum/90">
              {state.error ?? state.taskLabel}
              <div className="mt-2">
                <Button
                  variant="danger"
                  className="!py-1 text-[12px]"
                  onClick={() => hub().resolveError(id).catch((e) => notify({ tone: "error", text: String(e) }))}
                >
                  Acknowledge &amp; retry
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Job description</SectionTitle>
        <p className="text-[13px] leading-relaxed text-platinum/80">{profile.jobDescription}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {profile.responsibilities.map((r) => (
            <span key={r} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-platinum/75">
              {r}
            </span>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Assigned projects</SectionTitle>
        <div className="space-y-2.5">
          {profile.projects.map((p) => (
            <div key={p.name}>
              <div className="mb-1 flex justify-between text-[12.5px]">
                <span className="text-platinum">{p.name}</span>
                <span className="text-mist">{p.progress}%</span>
              </div>
              <div className="mb-1 text-[11px] text-mist">{p.client}</div>
              <ProgressBar value={p.progress} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle aside={<span className="text-[10px] text-mist">illustrative</span>}>Performance indicators</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          {profile.kpis.map((k) => (
            <div key={k.label} className="rounded-lg border border-white/[0.07] bg-black/20 p-2.5">
              <div className="font-display text-[20px] leading-none text-platinum">{k.value}</div>
              <div className="mt-1.5 text-[10.5px] leading-tight text-mist">{k.label}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Chat({ id }: { id: AgentId }) {
  const messages = useHub((s) => s.chats[id]) ?? [];
  const typing = useHub((s) => s.typing[id]);
  const set = useHub((s) => s.set);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const profile = agentById[id];
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    useHub.setState((s) => ({ typing: { ...s.typing, [id]: true } }));
    try {
      await hub().sendChat(id, t);
    } catch (e) {
      useHub.setState((s) => ({ typing: { ...s.typing, [id]: false } }));
      notify({ tone: "error", text: `Message failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  const assign = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    try {
      await hub().submitTask({ description: t, target: id, requestedBy: "Managing Director", via: `chat with ${profile.name}` });
      notify({ tone: "info", text: `Task logged and routed via HN Executive AI to ${profile.name}.` });
    } catch (e) {
      notify({ tone: "error", text: `Could not assign: ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  void set;

  return (
    <div className="flex h-full min-h-[320px] flex-col">
      <div className="flex-1 space-y-3 p-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-dashed border-white/10 p-4 text-[12.5px] text-mist">
            Ask {profile.name} about their work, current task or projects. To get a deliverable, use <span className="text-gold">Assign as task</span> — it
            is routed through HN Executive AI, tracked, and comes back to you for approval.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cx(
                "max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed",
                m.role === "user" ? "rounded-br-sm bg-gold/90 text-navy" : "rounded-bl-sm border border-white/[0.08] bg-white/[0.04] text-platinum/90",
              )}
            >
              {m.role === "agent" ? <Markdown source={m.content} /> : m.content}
              <div className={cx("mt-1 flex items-center gap-1.5 text-[10px]", m.role === "user" ? "text-navy/60" : "text-mist")}>
                {timeAgo(m.ts)}
                {m.role === "agent" && <ExecutionTag execution={m.execution} />}
              </div>
            </div>
          </div>
        ))}
        {typing && <div className="text-[12px] italic text-mist">{profile.name} is typing…</div>}
        <div ref={end} />
      </div>
      <div className="sticky bottom-0 border-t border-white/[0.07] bg-navy-900/80 p-3 backdrop-blur">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder={`Message ${profile.name}…`}
          className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-platinum placeholder:text-mist/70 focus:border-gold/60 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[10.5px] text-mist">{looksLikeTask(text) ? "This looks like a task — assign it so it is tracked." : "Enter to send · Shift+Enter for a new line"}</span>
          <div className="flex gap-1.5">
            <Button variant="outline" className="!py-1 text-[12px]" onClick={assign} disabled={!text.trim()}>
              Assign as task
            </Button>
            <Button variant="gold" className="!py-1 text-[12px]" onClick={send} disabled={!text.trim()}>
              <Send size={13} /> Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const TASK_STATUS_LABEL: Record<Task["status"], string> = {
  routing: "Routing",
  queued: "Queued",
  in_progress: "In progress",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
  failed: "Failed",
};

export function TaskRow({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const tone =
    task.status === "completed"
      ? "#3fb27f"
      : task.status === "awaiting_approval"
        ? "#c4a66a"
        : task.status === "rejected" || task.status === "failed"
          ? "#e5484d"
          : "#4c8dff";
  return (
    <button onClick={onOpen} className="w-full rounded-lg border border-white/[0.07] bg-black/20 p-3 text-left hover:border-gold/30">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-platinum">{task.title}</span>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px]" style={{ background: `${tone}22`, color: tone }}>
          {TASK_STATUS_LABEL[task.status]}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-mist">
        <span>{agentById[task.assignee].name}</span>
        {task.collaborators.length > 0 && <span>+ {task.collaborators.length}</span>}
        <span>·</span>
        <span>{timeAgo(task.createdAt)}</span>
        <ExecutionTag execution={task.execution} className="ml-auto" />
      </div>
      {OPEN_TASK.includes(task.status) && (
        <div className="mt-2">
          <ProgressBar value={task.progress} color={tone} />
        </div>
      )}
    </button>
  );
}

function Tasks({ id, tasks }: { id: AgentId; tasks: Task[] }) {
  const set = useHub((s) => s.set);
  return (
    <div className="space-y-4 p-4">
      <section className="rounded-lg border border-gold/25 bg-gold/[0.05] p-3">
        <SectionTitle>Assign a task to {agentById[id].name}</SectionTitle>
        <RequestForm target={id} compact />
      </section>
      <section>
        <SectionTitle>Tasks &amp; history</SectionTitle>
        <div className="space-y-2">
          {tasks.length === 0 && <p className="text-[12.5px] text-mist">No tasks yet.</p>}
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} onOpen={() => set({ dashboardOpen: true, openTaskId: t.id })} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Activity({ id }: { id: AgentId }) {
  const activity = useHub((s) => s.activity);
  const tasks = useHub((s) => s.tasks);
  const items = activity.filter((a) => a.agentId === id || (a.taskId && (tasks[a.taskId]?.assignee === id || tasks[a.taskId]?.collaborators.includes(id)))).slice(0, 60);
  return (
    <div className="p-4">
      <SectionTitle>Activity history</SectionTitle>
      {items.length === 0 && <p className="text-[12.5px] text-mist">No recorded activity yet — it appears here as {agentById[id].name} works.</p>}
      <ol className="relative space-y-3 border-l border-white/10 pl-4">
        {items.map((a) => (
          <li key={a.id} className="relative">
            <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-gold/80" />
            <p className="text-[12.5px] leading-snug text-platinum/85">{a.message}</p>
            <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-mist">
              {timeAgo(a.ts)} <ExecutionTag execution={a.execution} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ConciergeBody() {
  const select = useHub((s) => s.select);
  const tasks = useHub((s) => s.tasks);
  const recent = Object.values(tasks)
    .filter((t) => t.steps[0]?.text.toLowerCase().includes("concierge"))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);
  return (
    <>
      <Header title={concierge.name} subtitle="Reception" onClose={() => select(null)}>
        <p className="mt-1 text-[12.5px] text-platinum/70">{concierge.role}</p>
      </Header>
      <div className="scroll-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-[13px] leading-relaxed text-platinum/80">
          Welcome to HN.CO. Tell me what you need and I will pass it to <span className="text-gold">HN Executive AI</span>, who routes it to the right department.
          You will be asked to approve the result — and anything that would leave the company.
        </p>
        <section className="rounded-lg border border-gold/25 bg-gold/[0.05] p-3">
          <SectionTitle>New request</SectionTitle>
          <RequestForm via="the reception concierge" />
        </section>
        {recent.length > 0 && (
          <section>
            <SectionTitle>Requests from reception</SectionTitle>
            <div className="space-y-2">
              {recent.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={() => useHub.getState().set({ dashboardOpen: true, openTaskId: t.id })} />
              ))}
            </div>
          </section>
        )}
        <p className="flex items-center gap-1.5 text-[11px] text-mist">
          <MessageSquare size={12} /> The concierge is the front desk of the central orchestrator; it is not one of the twelve employees.
        </p>
      </div>
    </>
  );
}

export function TaskDetail({ task }: { task: Task }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-mist">
        <span>
          Lead: <span className="text-platinum">{agentById[task.assignee].name}</span>
        </span>
        {task.collaborators.length > 0 && (
          <span>
            · With: <span className="text-platinum">{task.collaborators.map((c) => agentById[c].name).join(", ")}</span>
          </span>
        )}
        <span>· {TASK_STATUS_LABEL[task.status]}</span>
        <ExecutionTag execution={task.execution} />
      </div>
      {task.externalAction && (
        <div className="rounded-md border border-gold/30 bg-gold/[0.06] p-2.5 text-[12px] text-gold-soft">
          External action detected: <strong>{task.externalAction}</strong>. It needs its own approval after the deliverable is accepted.
        </div>
      )}
      <ol className="relative space-y-2 border-l border-white/10 pl-4">
        {task.steps.map((s, i) => (
          <li key={i} className="relative text-[12.5px] text-platinum/85">
            <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-gold/70" />
            {s.text}
            <span className="ml-2 text-[10.5px] text-mist">{timeAgo(s.ts)}</span>
          </li>
        ))}
      </ol>
      {task.result ? (
        <div className="rounded-lg border border-white/[0.08] bg-black/25 p-4">
          <Markdown source={task.result.body} />
        </div>
      ) : (
        <p className="text-[12.5px] text-mist">The deliverable appears here when the draft reaches HN Executive AI.</p>
      )}
    </div>
  );
}
