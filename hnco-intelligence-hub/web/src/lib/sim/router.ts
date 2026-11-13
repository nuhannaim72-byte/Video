import { agents } from "../catalog";
import type { AgentId } from "../types";

/**
 * Keyword router used by the local simulation. Mirrors api/app/routing.py so both behave the same;
 * the live backend can replace this with an LLM routing decision.
 */
export type RoutingDecision = {
  assignee: AgentId;
  collaborators: AgentId[];
  scores: Partial<Record<AgentId, number>>;
  reason: string;
};

const normalise = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9&\- ]+/g, " ").replace(/\s+/g, " ")} `;

export function routeRequest(text: string): RoutingDecision {
  const t = normalise(text);
  const scores: Partial<Record<AgentId, number>> = {};
  for (const a of agents) {
    let score = 0;
    for (const kw of a.keywords) {
      if (t.includes(` ${kw.toLowerCase()} `) || t.includes(` ${kw.toLowerCase()}s `)) {
        score += kw.includes(" ") ? 3 : 2; // multi-word phrases are stronger signals
      }
    }
    if (score > 0) scores[a.id] = score;
  }
  const ranked = (Object.entries(scores) as [AgentId, number][])
    .filter(([id]) => id !== "executive")
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) {
    return {
      assignee: "strategy",
      collaborators: [],
      scores,
      reason: "No department keywords matched; defaulting to Strategy & Advisory for scoping.",
    };
  }
  const [top, topScore] = ranked[0];
  const collaborators = ranked
    .slice(1)
    .filter(([, s]) => s >= Math.max(2, topScore / 2))
    .slice(0, 2)
    .map(([id]) => id);
  const name = (id: AgentId) => agents.find((a) => a.id === id)!.name;
  return {
    assignee: top,
    collaborators,
    scores,
    reason:
      `Best match: ${name(top)}` +
      (collaborators.length ? `, supported by ${collaborators.map(name).join(" and ")}` : "") +
      ".",
  };
}

const EXTERNAL_PATTERNS: [RegExp, string][] = [
  [/\b(send|email|e-mail|mail)\b/i, "Send to an external recipient"],
  [/\b(publish|post|tweet|go live)\b/i, "Publish externally"],
  [/\b(submit)\b.*\b(tender|rfp|bid|proposal)\b/i, "Submit to a client or prospect"],
  [/\b(sign|execute)\b.*\b(contract|agreement|nda)\b/i, "Sign or execute a legal document"],
  [/\b(pay|transfer|wire|invoice the)\b/i, "Make or request a payment"],
  [/\b(contact|call|message)\b.*\b(client|customer|prospect|lead)s?\b/i, "Contact a client or prospect"],
  [/\b(share|forward)\b.*\b(client|customer|prospect|partner)s?\b/i, "Share with an external party"],
];

/** Anything that leaves the company needs a separate, explicit human approval. */
export function detectExternalAction(text: string): string | null {
  for (const [re, label] of EXTERNAL_PATTERNS) if (re.test(text)) return label;
  return null;
}

export function deriveTitle(text: string): string {
  const firstSentence = text.trim().split(/(?<=[.!?])\s/)[0].replace(/[.!?]+$/, "");
  const cleaned = firstSentence.replace(/^(please|can you|could you|kindly)\s+/i, "");
  const t = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

export const looksLikeTask = (text: string) =>
  /\b(prepare|create|draft|build|analy[sz]e|review|write|plan|produce|update|research|design|compile|summari[sz]e|forecast|set up|investigate|assess|send|publish)\b/i.test(
    text,
  );
