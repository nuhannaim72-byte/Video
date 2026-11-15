"use client";

import dynamic from "next/dynamic";
import { presence } from "@/lib/presence";
import { useHub } from "@/lib/store";
import { useHubConnection } from "./useHubConnection";
import { HudOverlay } from "./ui/HudOverlay";

// The 3D bundle (three.js, R3F, post-processing) loads only on this route, on the client.
const OfficeScene = dynamic(() => import("./scene/OfficeScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-mist">Preparing the headquarters…</div>,
});

// Exposed in development so automated checks can drive the camera and read state.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  (window as unknown as { __hub: typeof useHub }).__hub = useHub;
  (window as unknown as { __presence: typeof presence }).__presence = presence;
}

export default function HeadquartersApp() {
  useHubConnection();
  return (
    <div className="fixed inset-0 overflow-hidden bg-navy">
      <OfficeScene />
      <HudOverlay />
    </div>
  );
}
