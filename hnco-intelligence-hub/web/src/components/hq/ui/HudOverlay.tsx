"use client";

import { useHub } from "@/lib/store";
import { AgentLabels } from "./AgentLabels";
import { TouchPad, ViewControls } from "./CameraControls";
import { EnterOverlay } from "./EnterOverlay";
import { TopBar } from "./TopBar";

export function HudOverlay() {
  const entered = useHub((s) => s.entered);
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <AgentLabels />
      {entered && (
        <>
          <TopBar />
          <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center">
            <ViewControls />
          </div>
          <TouchPad />
        </>
      )}
      <EnterOverlay />
    </div>
  );
}
