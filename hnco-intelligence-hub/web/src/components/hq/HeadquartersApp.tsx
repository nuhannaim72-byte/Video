"use client";

import dynamic from "next/dynamic";
import { useHubConnection } from "./useHubConnection";
import { HudOverlay } from "./ui/HudOverlay";

// The 3D bundle (three.js, R3F, post-processing) loads only on this route, on the client.
const OfficeScene = dynamic(() => import("./scene/OfficeScene"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-mist">Preparing the headquarters…</div>,
});

export default function HeadquartersApp() {
  useHubConnection();
  return (
    <div className="fixed inset-0 overflow-hidden bg-navy">
      <OfficeScene />
      <HudOverlay />
    </div>
  );
}
