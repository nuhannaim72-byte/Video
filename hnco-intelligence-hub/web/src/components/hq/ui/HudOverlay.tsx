"use client";

import { LayoutDashboard, List, Map as MapIcon, X } from "lucide-react";
import { useState } from "react";
import { selectPendingApprovals, useHub } from "@/lib/store";
import { AgentLabels } from "./AgentLabels";
import { AgentPanel } from "./AgentPanel";
import { CameraModes, TouchPad, ViewControls } from "./CameraControls";
import { Dashboard } from "./Dashboard";
import { DepartmentList, DepartmentNav } from "./DepartmentNav";
import { EnterOverlay } from "./EnterOverlay";
import { Minimap } from "./Minimap";
import { Toasts } from "./Toasts";
import { TopBar } from "./TopBar";

/** Phone layout: camera modes and panels move into a bottom bar and sheets. */
function MobileBar() {
  const [sheet, setSheet] = useState<"departments" | "map" | null>(null);
  const pending = useHub((s) => selectPendingApprovals(s).length);
  const set = useHub((s) => s.set);
  return (
    <>
      {sheet && (
        <div className="panel pointer-events-auto absolute inset-x-2 bottom-[68px] z-40 max-h-[60vh] overflow-y-auto rounded-xl p-2 md:hidden">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-mist">{sheet === "map" ? "Floor plan" : "Departments"}</span>
            <button onClick={() => setSheet(null)} className="p-1 text-platinum/60" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          {sheet === "departments" ? <DepartmentList onPick={() => setSheet(null)} /> : <Minimap className="!border-0 !bg-transparent !p-0 !shadow-none" />}
        </div>
      )}
      <nav className="panel pointer-events-auto absolute inset-x-2 bottom-2 z-30 flex items-center justify-between gap-1 rounded-xl p-1.5 md:hidden">
        <CameraModes compact />
        <button onClick={() => setSheet(sheet === "departments" ? null : "departments")} className="rounded-lg p-2.5 text-platinum/80" aria-label="Departments">
          <List size={18} />
        </button>
        <button onClick={() => setSheet(sheet === "map" ? null : "map")} className="rounded-lg p-2.5 text-platinum/80" aria-label="Floor plan">
          <MapIcon size={18} />
        </button>
        <button onClick={() => set({ dashboardOpen: true })} className="relative rounded-lg p-2.5 text-gold" aria-label="Dashboard">
          <LayoutDashboard size={18} />
          {pending > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-status-error" />}
        </button>
      </nav>
    </>
  );
}

export function HudOverlay() {
  const entered = useHub((s) => s.entered);
  const panelOpen = useHub((s) => s.selected !== null);
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <AgentLabels />
      {entered && (
        <>
          <TopBar />
          <DepartmentNav />
          <Minimap className="absolute bottom-3 left-3 z-20 hidden md:block" />
          {/* Centred in the space between the minimap and the employee panel. */}
          <div className={`absolute bottom-3 left-[276px] z-20 hidden justify-center md:flex ${panelOpen ? "right-[436px]" : "right-3"}`}>
            <ViewControls compact={panelOpen} />
          </div>
          <AgentPanel />
          <Dashboard />
          <TouchPad />
          <MobileBar />
          <Toasts />
        </>
      )}
      <EnterOverlay />
    </div>
  );
}
