"use client";

import { create } from "zustand";
import { agentIds } from "./catalog";
import type { ZoneId } from "./floorplan";
import type {
  ActivityEntry,
  AgentId,
  AgentState,
  Approval,
  ChatMessage,
  Execution,
  HubEvent,
  Task,
} from "./types";

export type CameraMode = "orbit" | "isometric" | "first" | "third" | "follow";
export type Quality = "auto" | "high" | "balanced" | "low";
export type Connection = "local" | "connecting" | "connected" | "error";
export type Selection = AgentId | "concierge" | null;

type FlyTo = { zone: ZoneId; nonce: number } | null;

export type HubState = {
  // --- Organisation (driven by HubEvents) ---
  agents: Record<AgentId, AgentState>;
  tasks: Record<string, Task>;
  approvals: Record<string, Approval>;
  activity: ActivityEntry[];
  chats: Partial<Record<AgentId, ChatMessage[]>>;
  typing: Partial<Record<AgentId, boolean>>;
  /** What is producing events: the in-browser simulator or the HN.CO backend. */
  connection: Connection;
  /** Whether agent work is simulated or executed by real AI agents (reported by the source). */
  execution: Execution;
  backendUrl: string | null;
  connectionError: string | null;

  // --- Interface ---
  selected: Selection;
  hovered: Selection;
  cameraMode: CameraMode;
  flyTo: FlyTo;
  dashboardOpen: boolean;
  /** Task shown in the dashboard's detail view. */
  openTaskId: string | null;
  quality: Quality;
  effectiveQuality: Exclude<Quality, "auto">;
  simSpeed: number;
  showLabels: boolean;
  entered: boolean;
  composerOpen: boolean;
  composerTarget: AgentId | null;
  mobileNavOpen: boolean;

  apply: (event: HubEvent) => void;
  set: (patch: Partial<HubState>) => void;
  select: (who: Selection) => void;
  flyToZone: (zone: ZoneId) => void;
};

const idleAgents = () =>
  Object.fromEntries(
    agentIds.map((id) => [id, { id, status: "idle", activity: { kind: "desk" }, taskLabel: "Starting up" } satisfies AgentState]),
  ) as Record<AgentId, AgentState>;

const MAX_ACTIVITY = 250;

export const useHub = create<HubState>((set, get) => ({
  agents: idleAgents(),
  tasks: {},
  approvals: {},
  activity: [],
  chats: {},
  typing: {},
  connection: "local",
  execution: "simulated",
  backendUrl: null,
  connectionError: null,

  selected: null,
  hovered: null,
  cameraMode: "orbit",
  flyTo: null,
  dashboardOpen: false,
  openTaskId: null,
  quality: "auto",
  effectiveQuality: "balanced",
  simSpeed: 1,
  showLabels: true,
  entered: false,
  composerOpen: false,
  composerTarget: null,
  mobileNavOpen: false,

  set: (patch) => set(patch),
  select: (who) => set({ selected: who }),
  flyToZone: (zone) => set({ flyTo: { zone, nonce: Date.now() }, cameraMode: get().cameraMode === "isometric" ? "isometric" : "orbit" }),

  apply: (e) => {
    switch (e.type) {
      case "snapshot":
        set({
          agents: { ...idleAgents(), ...Object.fromEntries(e.agents.map((a) => [a.id, a])) },
          tasks: Object.fromEntries(e.tasks.map((t) => [t.id, t])),
          approvals: Object.fromEntries(e.approvals.map((a) => [a.id, a])),
          activity: [...e.activity].sort((a, b) => b.ts - a.ts).slice(0, MAX_ACTIVITY),
          execution: e.execution,
        });
        return;
      case "agent.updated":
        set((s) => ({ agents: { ...s.agents, [e.agent.id]: e.agent } }));
        return;
      case "task.updated":
        set((s) => ({ tasks: { ...s.tasks, [e.task.id]: e.task } }));
        return;
      case "approval.updated":
        set((s) => ({ approvals: { ...s.approvals, [e.approval.id]: e.approval } }));
        return;
      case "activity":
        set((s) => ({ activity: [e.entry, ...s.activity].slice(0, MAX_ACTIVITY) }));
        return;
      case "chat.message":
        set((s) => ({
          chats: { ...s.chats, [e.agentId]: [...(s.chats[e.agentId] ?? []), e.message] },
          typing: e.message.role === "agent" ? { ...s.typing, [e.agentId]: false } : s.typing,
        }));
        return;
    }
  },
}));

// --- Derived selectors -------------------------------------------------------------------------

export const selectPendingApprovals = (s: Pick<HubState, "approvals">) =>
  Object.values(s.approvals)
    .filter((a) => a.status === "pending")
    .sort((a, b) => a.createdAt - b.createdAt);

export const selectTasksSorted = (s: HubState) => Object.values(s.tasks).sort((a, b) => b.createdAt - a.createdAt);

export const OPEN_TASK: Task["status"][] = ["routing", "queued", "in_progress", "awaiting_approval"];
