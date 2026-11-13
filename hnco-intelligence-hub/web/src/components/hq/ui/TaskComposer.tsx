"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { agentById, agents } from "@/lib/catalog";
import { hub } from "@/lib/client";
import { detectExternalAction, routeRequest } from "@/lib/sim/router";
import type { AgentId } from "@/lib/types";
import { Button } from "./primitives";
import { notify } from "./Toasts";

const EXAMPLES = [
  "Prepare a financial performance report.",
  "Build a Power BI dashboard for client churn analysis.",
  "Draft a proposal for the public sector analytics tender and send it to the prospect.",
  "Plan the ERP data migration timeline with milestones.",
  "Review the supplier NDA for GDPR risks.",
];

/**
 * Request intake. Without a target, HN Executive AI decides who does the work; with a target, it is
 * still logged and routed through the Executive AI so the approval trail is complete.
 */
export function RequestForm({ target, via, compact = false }: { target?: AgentId; via?: string; compact?: boolean }) {
  const [text, setText] = useState("");
  const [to, setTo] = useState<AgentId | "auto">(target ?? "auto");
  const [busy, setBusy] = useState(false);
  const external = detectExternalAction(text);
  const preview = text.trim().length > 8 && to === "auto" ? routeRequest(text) : null;

  const submit = async () => {
    const description = text.trim();
    if (!description) return;
    setBusy(true);
    try {
      await hub().submitTask({
        description,
        target: to === "auto" ? null : to,
        requestedBy: "Managing Director",
        via,
      });
      setText("");
      notify({
        tone: "info",
        text: to === "auto" ? "Request sent to HN Executive AI for routing." : `Request routed via HN Executive AI to ${agentById[to].name}.`,
      });
    } catch (e) {
      notify({ tone: "error", text: `Request failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={compact ? 3 : 4}
        placeholder="Describe the work, e.g. “Prepare a financial performance report.”"
        className="w-full resize-none rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-platinum placeholder:text-mist/70 focus:border-gold/60 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
      />
      {!compact && !text && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setText(ex)} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-platinum/70 hover:border-gold/50 hover:text-gold-soft">
              {ex}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!target && (
          <label className="flex items-center gap-2 text-[12px] text-mist">
            Route to
            <select
              value={to}
              onChange={(e) => setTo(e.target.value as AgentId | "auto")}
              className="rounded-md border border-white/10 bg-navy-800 px-2 py-1 text-[12px] text-platinum focus:border-gold/60 focus:outline-none"
            >
              <option value="auto">HN Executive AI decides</option>
              {agents
                .filter((a) => a.id !== "executive")
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <div className="flex-1" />
        <Button variant="gold" onClick={submit} disabled={!text.trim() || busy}>
          {busy ? "Sending…" : target ? "Assign task" : "Submit request"}
        </Button>
      </div>
      {preview && (
        <p className="text-[11.5px] text-mist">
          Likely routing: <span className="text-platinum/85">{agentById[preview.assignee].name}</span>
          {preview.collaborators.length > 0 && <> with {preview.collaborators.map((c) => agentById[c].name).join(", ")}</>}
        </p>
      )}
      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-mist">
        <ShieldCheck size={13} className="mt-px shrink-0 text-gold" />
        {external ? (
          <span>
            <span className="text-gold-soft">External action detected ({external.toLowerCase()}).</span> It will not run until you approve it separately.
          </span>
        ) : (
          <span>Results come back to you for review. Anything that leaves the company needs your explicit approval.</span>
        )}
      </p>
    </div>
  );
}
