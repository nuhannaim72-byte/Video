import type { AgentId } from "./types";

/**
 * Where each agent physically is, written every frame by the 3D layer (not React state).
 * The simulator reads `settled` so work only progresses once an agent has reached its desk,
 * and the minimap reads positions on its own animation frame.
 */
export type Presence = { x: number; z: number; yaw: number; spotKey: string | null; settled: boolean };

export const presence = new Map<AgentId | "concierge" | "visitor", Presence>();

export const isSettledAt = (id: AgentId, spotKey: string) => {
  const p = presence.get(id);
  // Without a 3D view (e.g. tests, hidden tab) treat agents as settled so the simulation still runs.
  if (!p) return true;
  return p.settled && p.spotKey === spotKey;
};

/** The camera's ground position and heading, for the minimap. */
export const cameraPresence = { x: 0, z: 30, yaw: Math.PI, fov: 0.7 };
