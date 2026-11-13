import { agentById, departmentById } from "../catalog";
import type { AgentId, AgentState, Task } from "../types";
import { looksLikeTask } from "./router";

/** Small deterministic RNG so a task's simulated figures don't change between renders. */
export function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, arr: T[]) => arr[Math.floor(r() * arr.length)];
const pct = (r: () => number, lo: number, hi: number) => (lo + r() * (hi - lo)).toFixed(1);
const money = (r: () => number, lo: number, hi: number) => `£${(lo + r() * (hi - lo)).toFixed(2)}m`;

const SIM_NOTE =
  "> **Simulated draft.** Produced by the in-browser simulation with illustrative figures — not real company data. Connect the HN.CO backend for live agent execution against authorised data.";

/** Phase labels shown on the agent's status while it works. */
export const WORK_PHASES: Record<AgentId, { analyse: string; work: string; deliverable: string }> = {
  executive: { analyse: "Reviewing the request", work: "Compiling the executive brief", deliverable: "Executive brief" },
  strategy: { analyse: "Researching market and competitor data", work: "Drafting strategic recommendations", deliverable: "Strategy paper" },
  bizdev: { analyse: "Reviewing CRM pipeline data", work: "Drafting the proposal", deliverable: "Proposal draft" },
  marketing: { analyse: "Analysing channel and campaign data", work: "Drafting campaign content", deliverable: "Campaign plan" },
  project: { analyse: "Reviewing timelines and dependencies", work: "Updating the plan and Gantt chart", deliverable: "Project plan" },
  bi: { analyse: "Running the analysis on authorised datasets", work: "Building visualisations", deliverable: "Analytics report" },
  dataeng: { analyse: "Profiling source systems", work: "Designing the pipeline", deliverable: "Data engineering design" },
  technology: { analyse: "Mapping the current workflow", work: "Designing the automation", deliverable: "Automation design" },
  finance: { analyse: "Analysing authorised financial data", work: "Preparing the draft report", deliverable: "Financial report" },
  hr: { analyse: "Reviewing HR records and policies", work: "Drafting the HR document", deliverable: "HR document" },
  legal: { analyse: "Researching the legal and regulatory position", work: "Annotating clauses and risks", deliverable: "Legal research note" },
  clientsuccess: { analyse: "Reviewing account health and feedback", work: "Preparing the client review", deliverable: "Client success report" },
};

function body(task: Task, r: () => number): string {
  const a = agentById[task.assignee];
  const head = `## ${task.title}\n_Prepared by ${a.name} · routed by HN Executive AI_\n\n${SIM_NOTE}\n\n`;
  switch (task.assignee) {
    case "finance": {
      const rev = money(r, 3.1, 4.4);
      return (
        head +
        `### Headline\n- Revenue year-to-date **${rev}**, ${pct(r, 2, 9)}% ahead of budget.\n- Gross margin **${pct(r, 38, 46)}%** (target 40%).\n- Operating cash flow positive for the ${pick(r, ["third", "fourth", "fifth"])} consecutive month.\n\n` +
        `### Revenue by service line\n| Service line | YTD | vs budget |\n|---|---:|---:|\n| BI & Analytics | ${money(r, 1.1, 1.5)} | +${pct(r, 3, 12)}% |\n| Data Engineering | ${money(r, 0.8, 1.2)} | +${pct(r, 0, 6)}% |\n| Digital Transformation | ${money(r, 0.6, 1.0)} | -${pct(r, 1, 5)}% |\n| Strategy & Advisory | ${money(r, 0.4, 0.7)} | +${pct(r, 1, 8)}% |\n\n` +
        `### Cash flow\nClosing cash ${money(r, 1.2, 1.9)}; debtor days ${Math.round(38 + r() * 14)}. Two invoices over 60 days flagged to Client Success.\n\n` +
        `### Recommendations\n1. Hold Q4 discretionary spend at current run-rate.\n2. Re-price the Digital Transformation retainer at renewal.\n3. Review utilisation with Project AI before the next hiring round.`
      );
    }
    case "bi":
      return (
        head +
        `### Key findings\n- Primary KPI improved **${pct(r, 3, 14)}%** quarter on quarter.\n- ${pick(r, ["Two", "Three"])} segments explain ${pct(r, 60, 80)}% of the variance.\n- Data refresh success ${pct(r, 98, 99.9)}% across the period.\n\n` +
        `### Dashboard pages proposed\n1. Executive overview (KPI cards, trend, variance)\n2. Segment drill-down (decomposition tree)\n3. Operational detail (row-level, row-level security by region)\n\n` +
        `### Next steps\nValidate measures with the business owner, then publish to a test workspace — publishing to the client tenant needs approval.`
      );
    case "strategy":
      return (
        head +
        `### Situation\nThe addressable market is estimated at ${money(r, 40, 120)} growing ${pct(r, 4, 11)}% a year.\n\n### Options\n| Option | Value | Risk | Time to impact |\n|---|---|---|---|\n| A. Organic expansion | Medium | Low | 12–18 months |\n| B. Partnership-led entry | High | Medium | 6–9 months |\n| C. Acquisition | High | High | 3–6 months |\n\n### Recommendation\nPursue **Option B**, with a stage gate after two pilot engagements. BI AI to supply the evidence base; Finance AI to validate the business case.`
      );
    case "bizdev":
      return (
        head +
        `### Opportunity\nEstimated value ${money(r, 0.2, 0.9)}, probability ${Math.round(30 + r() * 40)}%.\n\n### Proposal outline\n1. Executive summary and understanding of need\n2. Approach: discovery → design → build → adopt\n3. Team, timeline and governance\n4. Commercials and assumptions\n\n### Pipeline impact\nWeighted pipeline rises to ${money(r, 2.2, 3.1)}. **Nothing is sent to the prospect until approved.**`
      );
    case "marketing":
      return (
        head +
        `### Campaign concept\n"${pick(r, ["From data to decisions", "Intelligence behind every transformation", "The data maturity gap"])}" — a ${pick(r, ["four", "six"])}-week thought-leadership campaign.\n\n### Channels\n- LinkedIn (organic + sponsored), forecast reach ${Math.round(40 + r() * 60)}k\n- Webinar with a client case study\n- Email nurture to ${Math.round(800 + r() * 1200)} contacts\n\n### Measures\nEngagement rate target ${pct(r, 4, 7)}%, ${Math.round(40 + r() * 60)} MQLs. **All posts are queued for approval before publishing.**`
      );
    case "project":
      return (
        head +
        `### Status: ${pick(r, ["Amber", "Green"])}\n- ${Math.round(6 + r() * 6)} of ${Math.round(13 + r() * 4)} milestones complete\n- Critical path: data migration → UAT → go-live\n- Forecast go-live within ${Math.round(1 + r() * 9)} days of baseline\n\n### Top risks\n| Risk | Impact | Mitigation |\n|---|---|---|\n| Source data quality | High | Data Engineering AI profiling sprint |\n| UAT availability | Medium | Book client testers now |\n| Scope creep | Medium | Change control via Executive AI |`
      );
    case "dataeng":
      return (
        head +
        `### Proposed architecture\nSources → ingestion (incremental, CDC where available) → bronze / silver / gold lakehouse layers → semantic model.\n\n### Pipelines\n| Pipeline | Schedule | Est. volume |\n|---|---|---|\n| CRM → bronze | Hourly | ${Math.round(20 + r() * 80)}k rows |\n| ERP → bronze | Nightly | ${Math.round(1 + r() * 4)}m rows |\n| Silver conformance | After load | — |\n\n### Data quality\n${Math.round(30 + r() * 30)} rules proposed (completeness, validity, referential integrity). No production changes are made without approval.`
      );
    case "technology":
      return (
        head +
        `### Current process\n${Math.round(6 + r() * 8)} manual steps, ~${Math.round(20 + r() * 40)} hours a month.\n\n### Automated design\n1. Trigger on document arrival\n2. Extract and validate fields\n3. Route exceptions to a human queue\n4. Post to the system of record **after approval**\n\n### Benefits\nEstimated ${Math.round(60 + r() * 30)}% effort reduction; payback in ${Math.round(2 + r() * 5)} months.`
      );
    case "hr":
      return (
        head +
        `### Summary\nDraft prepared from current HR policies and records.\n\n### Onboarding plan (first 30 days)\n- Week 1: accounts, security training, meet the team\n- Week 2: methodology and tooling (Power BI, Azure, delivery playbook)\n- Weeks 3–4: shadow an engagement, first client contribution\n\n### Notes\nDecisions about individuals stay with the Managing Director and line managers. Personal data is handled under the company's data protection policy.`
      );
    case "legal":
      return (
        head +
        `### Scope\nResearch support only — **not legal advice**. For review by qualified counsel.\n\n### Clause review\n| Clause | Observation | Risk |\n|---|---|---|\n| Limitation of liability | Cap below annual fees | Medium |\n| Data protection | Processor terms need updating | High |\n| IP ownership | Background IP not carved out | Medium |\n| Termination | 30-day convenience termination | Low |\n\n### Suggested next steps\nCounsel to review the high-risk items; Legal AI to prepare a mark-up for approval.`
      );
    case "clientsuccess":
      return (
        head +
        `### Account health\n- CSAT ${(4.3 + r() * 0.6).toFixed(1)}/5, NPS +${Math.round(40 + r() * 30)}\n- ${Math.round(2 + r() * 8)} open tickets, none breaching SLA\n- Renewal in ${Math.round(2 + r() * 9)} months; risk **${pick(r, ["Low", "Medium"])}**\n\n### Recommended actions\n1. Schedule a quarterly business review\n2. Share the new BI roadmap with the sponsor\n3. Address the two oldest support tickets this week\n\nClient-facing messages are drafted for approval and never sent automatically.`
      );
    default:
      return (
        head +
        `### Summary\nConsolidated view across departments for the Managing Director.\n\n### Highlights\n- ${Math.round(8 + r() * 6)} tasks completed this week\n- ${Math.round(1 + r() * 4)} items awaiting your approval\n- No critical risks open`
      );
  }
}

export function draftResult(task: Task): { summary: string; body: string } {
  const r = seeded(task.id);
  const a = agentById[task.assignee];
  const phases = WORK_PHASES[task.assignee];
  const collab = task.collaborators.length
    ? ` with input from ${task.collaborators.map((c) => agentById[c].name).join(" and ")}`
    : "";
  return {
    summary: `${phases.deliverable} drafted by ${a.name}${collab}. Ready for Managing Director review (simulated).`,
    body: body(task, r),
  };
}

/** Simulated chat reply. Always says it is simulated. */
export function chatReply(agentId: AgentId, text: string, state: AgentState, openTasks: Task[]): string {
  const a = agentById[agentId];
  const dept = departmentById[a.department];
  const r = seeded(text + agentId + Date.now());
  const t = text.toLowerCase();

  if (/\b(hi|hello|hey|good (morning|afternoon|evening))\b/.test(t) && t.length < 40) {
    return `Good to hear from you. I'm ${a.name}, ${a.role.toLowerCase()} in ${dept.name}. Right now I'm ${state.taskLabel.toLowerCase()}. How can I help?`;
  }
  if (/\b(what are you|status|working on|doing|progress|busy)\b/.test(t)) {
    const mine = openTasks.filter((x) => x.assignee === agentId);
    const taskLine = mine.length
      ? `I have ${mine.length} open task${mine.length > 1 ? "s" : ""}: ${mine.map((m) => `"${m.title}" (${m.status.replace("_", " ")}, ${Math.round(m.progress)}%)`).join("; ")}.`
      : "I have no assigned tasks right now, so I'm on routine work.";
    return `Currently: ${state.taskLabel}. ${taskLine}`;
  }
  if (/\b(who|what) (are|do) you\b|\byour role\b|\bwhat can you do\b/.test(t)) {
    return `${a.jobDescription} My main responsibilities: ${a.responsibilities.join(", ").toLowerCase()}.`;
  }
  if (/\bprojects?\b/.test(t)) {
    return `My current projects: ${a.projects.map((p) => `${p.name} (${p.client}, ${p.progress}% complete)`).join("; ")}.`;
  }
  if (looksLikeTask(text)) {
    return `I can take that on. Use "Assign as task" and it will be logged, routed through HN Executive AI and come back to you for approval before anything leaves the company. I'd start with: ${pick(r, a.routine).toLowerCase()}.`;
  }
  return `${pick(r, [
    "Good question.",
    "Understood.",
    "Noted.",
  ])} From the ${dept.name} side, I'd look at ${pick(r, a.responsibilities).toLowerCase()} first, then share findings with HN Executive AI. If you want a deliverable, assign it as a task so it's tracked and approved.`;
}

export const SIMULATED_CHAT_SUFFIX = "Simulated response — connect the backend for live AI.";
