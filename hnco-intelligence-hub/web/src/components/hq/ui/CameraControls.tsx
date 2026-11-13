"use client";

import { Box, Building2, Expand, Footprints, Minimize, Orbit, RotateCcw, RotateCw, User, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useHub, type CameraMode } from "@/lib/store";
import { moveInput, rigCommands } from "../scene/CameraRig";
import { cx } from "./primitives";

const MODES: { id: CameraMode; label: string; icon: typeof Orbit; hint: string }[] = [
  { id: "orbit", label: "Overview", icon: Orbit, hint: "Drag to rotate · scroll to zoom · right-drag to pan" },
  { id: "isometric", label: "Isometric", icon: Box, hint: "Drag to rotate · scroll to zoom · right-drag to pan" },
  { id: "first", label: "First person", icon: Footprints, hint: "W A S D to walk · drag to look · Shift to walk faster" },
  { id: "third", label: "Third person", icon: User, hint: "W A S D to walk · drag to orbit the camera" },
];

export function CameraModes({ compact = false }: { compact?: boolean }) {
  const mode = useHub((s) => s.cameraMode);
  const set = useHub((s) => s.set);
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-black/25 p-0.5" role="radiogroup" aria-label="Camera mode">
      {MODES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role="radio"
          aria-checked={mode === id || (id === "orbit" && mode === "follow")}
          onClick={() => set({ cameraMode: id })}
          title={label}
          className={cx(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors",
            mode === id || (id === "orbit" && mode === "follow") ? "bg-gold text-navy" : "text-platinum/75 hover:bg-white/5 hover:text-platinum",
          )}
        >
          <Icon size={14} />
          {!compact && <span className="hidden xl:inline">{label}</span>}
        </button>
      ))}
    </div>
  );
}

export function ViewControls() {
  const mode = useHub((s) => s.cameraMode);
  const flyToZone = useHub((s) => s.flyToZone);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };
  const hint = MODES.find((m) => m.id === mode)?.hint ?? "Following the selected employee";
  const btn = "grid h-9 w-9 place-items-center rounded-lg text-platinum/80 hover:bg-white/[0.07] hover:text-platinum";
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5">
      <div className="panel flex items-center gap-1 rounded-xl px-1.5 py-1">
        <CameraModes />
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button className={btn} onClick={() => rigCommands.zoom(0.8)} title="Zoom in" aria-label="Zoom in">
          <ZoomIn size={16} />
        </button>
        <button className={btn} onClick={() => rigCommands.zoom(1.25)} title="Zoom out" aria-label="Zoom out">
          <ZoomOut size={16} />
        </button>
        <button className={btn} onClick={() => rigCommands.rotate(Math.PI / 8)} title="Rotate left" aria-label="Rotate left">
          <RotateCcw size={16} />
        </button>
        <button className={btn} onClick={() => rigCommands.rotate(-Math.PI / 8)} title="Rotate right" aria-label="Rotate right">
          <RotateCw size={16} />
        </button>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button
          className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-gold-soft hover:bg-gold/10"
          onClick={() => flyToZone("executive")}
          title="Return to the Executive Office"
        >
          <Building2 size={15} />
          <span className="hidden lg:inline">Executive Office</span>
        </button>
        <button className={btn} onClick={toggleFull} title={full ? "Exit fullscreen" : "Fullscreen"} aria-label="Toggle fullscreen">
          {full ? <Minimize size={16} /> : <Expand size={16} />}
        </button>
      </div>
      <p className="hidden rounded-full bg-black/30 px-3 py-0.5 text-[11px] text-platinum/60 md:block">{hint}</p>
    </div>
  );
}

/** On-screen walking pad for touch devices in first/third person. */
export function TouchPad() {
  const mode = useHub((s) => s.cameraMode);
  if (mode !== "first" && mode !== "third") return null;
  const hold = (f: number, r: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      moveInput.forward = f;
      moveInput.right = r;
    },
    onPointerUp: () => {
      moveInput.forward = 0;
      moveInput.right = 0;
    },
    onPointerCancel: () => {
      moveInput.forward = 0;
      moveInput.right = 0;
    },
  });
  const b = "grid h-12 w-12 place-items-center rounded-xl bg-black/35 text-platinum/85 active:bg-gold/40 select-none touch-none text-lg";
  return (
    <div className="pointer-events-auto absolute bottom-24 left-4 z-20 grid grid-cols-3 gap-1.5 md:hidden" aria-label="Walk controls">
      <span />
      <button className={b} {...hold(1, 0)} aria-label="Forward">▲</button>
      <span />
      <button className={b} {...hold(0, -1)} aria-label="Left">◀</button>
      <button className={b} {...hold(-1, 0)} aria-label="Back">▼</button>
      <button className={b} {...hold(0, 1)} aria-label="Right">▶</button>
    </div>
  );
}
