import raw from "../data/catalog.json"; // synced from ../shared/catalog.json by scripts/sync-catalog.mjs
import type { AgentId, DepartmentId } from "./types";

export type HairStyle = "short" | "long" | "bun" | "curly" | "bald";

export type Appearance = {
  suit: string;
  trousers: string;
  shirt: string;
  tie: string | null;
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  height: number;
  build: number;
};

export type AgentProfile = {
  id: AgentId;
  name: string;
  role: string;
  department: DepartmentId;
  summary: string;
  jobDescription: string;
  responsibilities: string[];
  keywords: string[];
  projects: { name: string; client: string; progress: number }[];
  kpis: { label: string; value: string }[];
  routine: string[];
  appearance: Appearance;
};

export type Department = {
  id: DepartmentId;
  name: string;
  short: string;
  description: string;
  workstation: string;
};

export const company = raw.company;
export const concierge = raw.concierge;
export const departments = raw.departments as Department[];
export const agents = raw.agents as AgentProfile[];

export const agentById = Object.fromEntries(agents.map((a) => [a.id, a])) as Record<AgentId, AgentProfile>;
export const departmentById = Object.fromEntries(departments.map((d) => [d.id, d])) as Record<
  DepartmentId,
  Department
>;
export const agentIds = agents.map((a) => a.id);

export const STATUS_META = {
  working: { label: "Working", color: "#3fb27f" },
  analysing: { label: "Analysing", color: "#4c8dff" },
  waiting: { label: "Waiting for approval", color: "#c4a66a" },
  idle: { label: "Idle", color: "#8b94a3" },
  error: { label: "Requires attention", color: "#e5484d" },
} as const;
