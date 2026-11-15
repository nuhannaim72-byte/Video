"use client";

import { ChevronLeft, Coffee, DoorOpen, Presentation } from "lucide-react";
import { useState } from "react";
import { agentById, departments } from "@/lib/catalog";
import type { ZoneId } from "@/lib/floorplan";
import { useHub } from "@/lib/store";
import type { AgentId } from "@/lib/types";
import { cx, StatusDot } from "./primitives";

const PLACES: { zone: ZoneId; label: string; icon: typeof Coffee }[] = [
  { zone: "reception", label: "Reception", icon: DoorOpen },
  { zone: "boardroom", label: "Glass Boardroom", icon: Presentation },
  { zone: "cafe", label: "Café", icon: Coffee },
];

export function DepartmentList({ onPick }: { onPick?: () => void }) {
  const agents = useHub((s) => s.agents);
  const selected = useHub((s) => s.selected);
  const flyToZone = useHub((s) => s.flyToZone);
  const select = useHub((s) => s.select);

  const go = (zone: ZoneId, agent?: AgentId) => {
    flyToZone(zone);
    if (agent) select(agent);
    onPick?.();
  };

  return (
    <div className="flex flex-col gap-0.5">
      {departments.map((d) => {
        const st = agents[d.id];
        return (
          <button
            key={d.id}
            onClick={() => go(d.id, d.id)}
            className={cx(
              "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
              selected === d.id ? "bg-gold/15 ring-1 ring-gold/40" : "hover:bg-white/[0.05]",
            )}
          >
            <StatusDot status={st?.status ?? "idle"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-platinum">{d.name}</span>
              <span className="block truncate text-[11px] text-mist">{st?.taskLabel ?? agentById[d.id].role}</span>
            </span>
          </button>
        );
      })}
      <div className="my-1.5 h-px bg-white/[0.06]" />
      {PLACES.map(({ zone, label, icon: Icon }) => (
        <button
          key={zone}
          onClick={() => go(zone)}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] text-platinum/80 hover:bg-white/[0.05] hover:text-platinum"
        >
          <Icon size={14} className="text-gold" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function DepartmentNav() {
  const [open, setOpen] = useState(true);
  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="panel pointer-events-auto absolute left-3 top-[76px] z-20 hidden rounded-lg px-3 py-2 text-[12px] text-platinum/85 md:block"
      >
        Departments
      </button>
    );
  return (
    <aside className="panel pointer-events-auto absolute bottom-[200px] left-3 top-[76px] z-20 hidden w-[256px] flex-col rounded-xl md:flex">
      <div className="flex items-center justify-between px-3.5 pb-1 pt-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-mist">Departments</div>
          <div className="font-display text-[17px] text-platinum">12 AI employees</div>
        </div>
        <button onClick={() => setOpen(false)} className="rounded-md p-1 text-platinum/60 hover:bg-white/5" aria-label="Collapse departments">
          <ChevronLeft size={16} />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        <DepartmentList />
      </div>
    </aside>
  );
}
