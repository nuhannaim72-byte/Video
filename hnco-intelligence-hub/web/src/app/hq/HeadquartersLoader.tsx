"use client";

import dynamic from "next/dynamic";

// Client-only: the headquarters needs WebGL, browser storage and live connections.
const HeadquartersApp = dynamic(() => import("@/components/hq/HeadquartersApp"), { ssr: false });

export default function HeadquartersLoader() {
  return <HeadquartersApp />;
}
