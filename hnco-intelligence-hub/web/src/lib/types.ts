// Shared domain types. The event protocol mirrors api/app/models.py — keep them in sync.

export type AgentId =
  | "executive"
  | "strategy"
  | "bizdev"
  | "marketing"
  | "project"
  | "bi"
  | "dataeng"
  | "technology"
  | "finance"
  | "hr"
  | "legal"
  | "clientsuccess";

export type DepartmentId = AgentId;

/** GREEN working · BLUE analysing · GOLD waiting for approval · GREY idle · RED error */
export type AgentStatus = "working" | "analysing" | "waiting" | "idle" | "error";

/**
 * What the agent is physically doing in the office. Semantic only — the 3D layer
 * resolves it to a place and a pose, so the backend never needs to know the floor plan.
 */
export type ActivityKind =
  | "desk" // seated at own desk, typing / reading monitors
  | "workstation" // seated at the department's specialist workstation
  | "meeting" // seated in the glass boardroom
  | "present" // standing at the boardroom screen, presenting
  | "collaborate" // standing at another agent's desk
  | "break" // café
  | "idle" // standing near own desk
  | "handoff"; // walking a draft to the Executive Office

export type Activity = {
  kind: ActivityKind;
  /** For collaborate / handoff: the agent being visited. */
  withAgent?: AgentId;
  /** Seat index for meetings. */
  seat?: number;
};

/** Where an event or result came from. Always shown in the UI. */
export type Execution = "simulated" | "live";

export type AgentState = {
  id: AgentId;
  status: AgentStatus;
  activity: Activity;
  taskLabel: string;
  taskId?: string;
  progress?: number;
  error?: string;
};

export type TaskStatus =
  | "routing"
  | "queued"
  | "in_progress"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "completed"
  | "failed";

export type TaskStep = { ts: number; agentId: AgentId | "concierge" | "user"; text: string };

export type Task = {
  id: string;
  title: string;
  description: string;
  requestedBy: string;
  assignee: AgentId;
  collaborators: AgentId[];
  routedBy: AgentId | null;
  status: TaskStatus;
  progress: number;
  createdAt: number;
  updatedAt: number;
  externalAction: string | null;
  result: { summary: string; body: string; artifactUrl?: string | null } | null;
  steps: TaskStep[];
  execution: Execution;
};

export type ApprovalKind = "deliverable_review" | "external_action";

export type Approval = {
  id: string;
  taskId: string;
  kind: ApprovalKind;
  title: string;
  summary: string;
  requestedBy: AgentId;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
  note?: string;
  execution: Execution;
};

export type ActivityEntry = {
  id: string;
  ts: number;
  agentId: AgentId | "concierge" | "system" | "user";
  kind: "task" | "status" | "chat" | "approval" | "movement" | "error" | "system";
  message: string;
  taskId?: string;
  execution: Execution;
};

export type ChatMessage = {
  id: string;
  ts: number;
  role: "user" | "agent";
  content: string;
  execution: Execution;
};

/** Events that drive the office. Produced by the local simulator or by the backend over SSE. */
export type HubEvent =
  | {
      type: "snapshot";
      agents: AgentState[];
      tasks: Task[];
      approvals: Approval[];
      activity: ActivityEntry[];
      execution: Execution;
    }
  | { type: "agent.updated"; agent: AgentState }
  | { type: "task.updated"; task: Task }
  | { type: "approval.updated"; approval: Approval }
  | { type: "activity"; entry: ActivityEntry }
  | { type: "chat.message"; agentId: AgentId; message: ChatMessage };
