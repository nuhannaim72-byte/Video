"use client";

import { Fragment, type ReactNode } from "react";
import { STATUS_META } from "@/lib/catalog";
import type { AgentStatus, Execution } from "@/lib/types";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function Wordmark({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cx("font-display tracking-[0.08em] text-platinum", className)}>
      HN<span className="text-gold">.</span>CO
      {!compact && <span className="ml-2 font-sans text-[0.62em] font-medium uppercase tracking-[0.28em] text-mist">Intelligence Hub</span>}
    </span>
  );
}

export function StatusDot({ status, pulse = true, size = 8 }: { status: AgentStatus; pulse?: boolean; size?: number }) {
  const color = STATUS_META[status].color;
  const animate = pulse && (status === "analysing" || status === "error" || status === "waiting");
  return (
    <span
      className={cx("inline-block shrink-0 rounded-full", animate && "pulse-dot")}
      style={{ width: size, height: size, background: color, boxShadow: `0 0 10px ${color}` }}
      aria-hidden
    />
  );
}

export function StatusPill({ status }: { status: AgentStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${m.color}1f`, color: m.color, border: `1px solid ${m.color}40` }}
    >
      <StatusDot status={status} size={6} />
      {m.label}
    </span>
  );
}

/** Every result is labelled with where it came from. */
export function ExecutionTag({ execution, className = "" }: { execution: Execution; className?: string }) {
  return execution === "live" ? (
    <span className={cx("rounded-sm border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wider text-emerald-300", className)}>
      Live AI
    </span>
  ) : (
    <span className={cx("rounded-sm border border-gold/40 bg-gold/10 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wider text-gold-soft", className)}>
      Simulated
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  className = "",
  disabled,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "gold" | "ghost" | "outline" | "danger";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const styles = {
    gold: "bg-gold text-navy hover:bg-gold-soft font-semibold",
    ghost: "text-platinum/85 hover:bg-white/[0.06] hover:text-platinum",
    outline: "border border-white/12 text-platinum hover:border-gold/60 hover:text-gold-soft",
    danger: "border border-status-error/40 text-[#ff8a8d] hover:bg-status-error/10",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-mist">{children}</h3>
      {aside}
    </div>
  );
}

export function ProgressBar({ value, color = "#c4a66a" }: { value: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function timeAgo(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// --- Minimal Markdown (headings, lists, tables, quotes, bold/italic) for report drafts ---------

function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("_") && p.endsWith("_") && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("## ")) out.push(<h2 key={i}>{inline(l.slice(3))}</h2>);
    else if (l.startsWith("### ")) out.push(<h3 key={i}>{inline(l.slice(4))}</h3>);
    else if (l.startsWith("> ")) out.push(<blockquote key={i}>{inline(l.slice(2))}</blockquote>);
    else if (l.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!/^\|[\s|:-]+\|$/.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <table key={`t${i}`}>
          <thead>
            <tr>{head?.map((h, k) => <th key={k}>{inline(h)}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((r, k) => (
              <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    } else if (/^(- |\d+\. )/.test(l)) {
      const ordered = /^\d+\. /.test(l);
      const items: string[] = [];
      while (i < lines.length && /^(- |\d+\. )/.test(lines[i])) {
        items.push(lines[i].replace(/^(- |\d+\. )/, ""));
        i++;
      }
      const List = ordered ? "ol" : "ul";
      out.push(
        <List key={`l${i}`}>
          {items.map((it, k) => (
            <li key={k}>{inline(it)}</li>
          ))}
        </List>,
      );
      continue;
    } else if (l.trim()) out.push(<p key={i}>{inline(l)}</p>);
    i++;
  }
  return <div className="report">{out}</div>;
}
