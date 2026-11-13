"use client";

import { Bell, LayoutDashboard, Settings2, Tag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { selectPendingApprovals, useHub, type Quality } from "@/lib/store";
import { cx, ExecutionTag, Wordmark } from "./primitives";

function ConnectionBadge() {
  const connection = useHub((s) => s.connection);
  const execution = useHub((s) => s.execution);
  const error = useHub((s) => s.connectionError);
  const label =
    connection === "local"
      ? "Local simulation · no backend"
      : connection === "connecting"
        ? "Connecting to HN.CO backend…"
        : connection === "error"
          ? "Backend unreachable — retrying"
          : execution === "live"
            ? "Connected · live AI agents"
            : "Connected · backend in simulated mode";
  const dot = connection === "connected" ? (execution === "live" ? "#3fb27f" : "#c4a66a") : connection === "error" ? "#e5484d" : "#8b94a3";
  return (
    <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/20 py-1 pl-2 pr-2.5 text-[11.5px] text-platinum/85 md:flex" title={error ?? undefined}>
      <span className="h-2 w-2 rounded-full" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />
      {label}
      <ExecutionTag execution={connection === "connected" ? execution : "simulated"} />
    </div>
  );
}

export function TopBar() {
  const pending = useHub((s) => selectPendingApprovals(s).length);
  const dashboardOpen = useHub((s) => s.dashboardOpen);
  const showLabels = useHub((s) => s.showLabels);
  const set = useHub((s) => s.set);
  const [settings, setSettings] = useState(false);

  return (
    <header className="panel pointer-events-auto absolute inset-x-2 top-2 z-30 flex h-14 items-center gap-3 rounded-xl px-3 md:inset-x-3 md:top-3 md:px-4">
      <Link href="/" className="flex items-center gap-2" aria-label="HN.CO home">
        <Wordmark className="text-[22px] leading-none" compact />
        <span className="hidden flex-col leading-tight lg:flex">
          <span className="text-[12.5px] font-medium text-platinum">Intelligence Hub</span>
          <span className="text-[10.5px] uppercase tracking-[0.2em] text-mist">Virtual Headquarters</span>
        </span>
      </Link>
      <div className="mx-2 hidden h-6 w-px bg-white/10 lg:block" />
      <ConnectionBadge />
      <div className="flex-1" />
      <button
        onClick={() => set({ dashboardOpen: !dashboardOpen })}
        className={cx(
          "relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
          dashboardOpen ? "bg-gold text-navy" : "border border-gold/40 text-gold-soft hover:bg-gold/10",
        )}
      >
        <LayoutDashboard size={16} />
        <span className="hidden sm:inline">Director&apos;s Dashboard</span>
        {pending > 0 && (
          <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-status-error px-1 text-[10.5px] font-bold text-white">
            {pending}
          </span>
        )}
      </button>
      <button
        onClick={() => set({ dashboardOpen: true })}
        className="relative hidden rounded-lg p-2 text-platinum/80 hover:bg-white/5 md:block"
        title={`${pending} approval request${pending === 1 ? "" : "s"}`}
        aria-label="Approval requests"
      >
        <Bell size={17} />
        {pending > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-gold" />}
      </button>
      <button
        onClick={() => set({ showLabels: !showLabels })}
        className={cx("hidden rounded-lg p-2 hover:bg-white/5 md:block", showLabels ? "text-gold" : "text-platinum/60")}
        title={showLabels ? "Hide name tags" : "Show name tags"}
        aria-label="Toggle name tags"
      >
        <Tag size={17} />
      </button>
      <div className="relative">
        <button onClick={() => setSettings((v) => !v)} className="rounded-lg p-2 text-platinum/80 hover:bg-white/5" aria-label="Settings">
          <Settings2 size={17} />
        </button>
        {settings && <SettingsMenu onClose={() => setSettings(false)} />}
      </div>
    </header>
  );
}

function SettingsMenu({ onClose }: { onClose: () => void }) {
  const quality = useHub((s) => s.quality);
  const effective = useHub((s) => s.effectiveQuality);
  const speed = useHub((s) => s.simSpeed);
  const connection = useHub((s) => s.connection);
  const showLabels = useHub((s) => s.showLabels);
  const set = useHub((s) => s.set);
  const opts: Quality[] = ["auto", "high", "balanced", "low"];
  return (
    <div className="panel absolute right-0 top-11 z-40 w-64 rounded-xl p-3 text-[13px]" onMouseLeave={onClose}>
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-mist">Graphics quality</div>
      <div className="mb-1 grid grid-cols-4 gap-1">
        {opts.map((q) => (
          <button
            key={q}
            onClick={() => set({ quality: q })}
            className={cx("rounded-md py-1 capitalize", quality === q ? "bg-gold text-navy" : "bg-white/5 text-platinum/80 hover:bg-white/10")}
          >
            {q}
          </button>
        ))}
      </div>
      <div className="mb-3 text-[11px] text-mist">Rendering at: {effective}</div>
      {connection === "local" && (
        <>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-mist">Simulation speed</div>
          <div className="mb-3 grid grid-cols-3 gap-1">
            {[1, 2, 4].map((n) => (
              <button
                key={n}
                onClick={() => set({ simSpeed: n })}
                className={cx("rounded-md py-1", speed === n ? "bg-gold text-navy" : "bg-white/5 text-platinum/80 hover:bg-white/10")}
              >
                {n}×
              </button>
            ))}
          </div>
        </>
      )}
      <label className="flex items-center justify-between py-1 text-platinum/85">
        Name tags
        <input type="checkbox" checked={showLabels} onChange={(e) => set({ showLabels: e.target.checked })} className="accent-[#c4a66a]" />
      </label>
    </div>
  );
}
