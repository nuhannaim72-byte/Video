"use client";

import { AdaptiveEvents, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import { useHub, type HubState } from "@/lib/store";
import { Agents } from "./Agents";
import { Architecture } from "./Architecture";
import { Effects, Lighting } from "./Atmosphere";
import { CameraRig } from "./CameraRig";
import { LogoWall } from "./Logo";
import { Screens, Signage } from "./Screens";

type Tier = HubState["effectiveQuality"];
const ORDER: Tier[] = ["low", "balanced", "high"];

function initialTier(): Tier {
  if (typeof window === "undefined") return "balanced";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  const mobile = window.matchMedia("(max-width: 820px), (pointer: coarse)").matches;
  return mobile || weak ? "low" : "balanced";
}

export default function OfficeScene() {
  const quality = useHub((s) => s.quality);
  const effective = useHub((s) => s.effectiveQuality);
  const [dpr, setDpr] = useState(1.25);

  useEffect(() => {
    if (quality === "auto") useHub.getState().set({ effectiveQuality: initialTier() });
    else useHub.getState().set({ effectiveQuality: quality });
  }, [quality]);

  useEffect(() => {
    const max = typeof window !== "undefined" ? window.devicePixelRatio : 1;
    setDpr(effective === "high" ? Math.min(max, 2) : effective === "balanced" ? Math.min(max, 1.5) : 1);
  }, [effective]);

  const step = (dir: 1 | -1) => {
    const s = useHub.getState();
    if (s.quality !== "auto") return;
    const i = ORDER.indexOf(s.effectiveQuality) + dir;
    if (i >= 0 && i < ORDER.length) s.set({ effectiveQuality: ORDER[i] });
  };

  return (
    <Canvas
      shadows={{ type: THREE.PCFSoftShadowMap }}
      dpr={dpr}
      gl={{ antialias: effective !== "high", powerPreference: "high-performance", preserveDrawingBuffer: false }}
      camera={{ fov: 42, near: 0.1, far: 2000 }}
      onPointerMissed={() => useHub.getState().select(null)}
      style={{ position: "absolute", inset: 0 }}
    >
      <PerformanceMonitor bounds={() => [38, 58]} flipflops={3} onDecline={() => step(-1)} onIncline={() => step(1)} />
      <AdaptiveEvents />
      <fog attach="fog" args={["#e9dccb", 140, 520]} />
      <CameraRig />
      <Lighting />
      <Suspense fallback={null}>
        <Architecture />
        <Screens />
        <Signage />
        <LogoWall />
        <Agents />
      </Suspense>
      <Effects />
    </Canvas>
  );
}
