"use client";

import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { agentById, agents, STATUS_META, type Appearance } from "@/lib/catalog";
import { BREAK_SPOTS, floorplan, routeBetween, type RoutePoint, type Spot } from "@/lib/floorplan";
import { presence } from "@/lib/presence";
import { useHub } from "@/lib/store";
import type { AgentId, AgentState } from "@/lib/types";
import { applyPose, copyPose, dampPose, FigureRig, L, newPose, PARTS, solveArmIK, type PartKey, type Pose } from "./rig";

type FigId = AgentId | "concierge" | "visitor";

const CONCIERGE_LOOK: Appearance = {
  suit: "#101827",
  trousers: "#101827",
  shirt: "#ffffff",
  tie: null,
  skin: "#e3b896",
  hair: "#2a1e18",
  hairStyle: "bun",
  height: 0.96,
  build: 0.92,
};
const VISITOR_LOOK: Appearance = {
  suit: "#0f1522",
  trousers: "#0f1522",
  shirt: "#f7f7f5",
  tie: "#c4a66a",
  skin: "#d7a985",
  hair: "#3b3029",
  hairStyle: "short",
  height: 1.0,
  build: 1.02,
};

type Fig = {
  idx: number;
  id: FigId;
  rig: FigureRig;
  scale: number;
  pose: Pose;
  target: Pose;
  x: number;
  z: number;
  yaw: number;
  spot: Spot | null;
  spotKey: string | null;
  /** Spot the current walk is heading to. */
  targetKey: string | null;
  path: RoutePoint[];
  pi: number;
  walking: boolean;
  pendingSpot: string | null;
  settled: boolean;
  phase: number;
  seed: number;
  speed: number;
};

const WALK_SPEED = 1.35;
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const IDENTITY_Q = new THREE.Quaternion();

// --- Spot resolution ---------------------------------------------------------------------------

const ALTERNATES = (host: AgentId) =>
  host === "executive" ? ["executive:visitor", "executive:visitor2", "executive:collab"] : [`${host}:visitor`, `${host}:collab`, `${host}:collab2`];

function desiredSpots(states: Record<AgentId, AgentState>): Record<AgentId, string> {
  const claims = new Map<string, AgentId>();
  const out = {} as Record<AgentId, string>;
  const claim = (id: AgentId, options: string[]) => {
    const key = options.find((k) => floorplan.spots[k] && !claims.has(k)) ?? options[0];
    claims.set(key, id);
    out[id] = key;
  };
  // Own desks first so nobody else takes them.
  const order = [...agents.map((a) => a.id)].sort((a, b) => {
    const pa = ["desk", "workstation", "meeting", "present"].includes(states[a]?.activity.kind ?? "") ? 0 : 1;
    const pb = ["desk", "workstation", "meeting", "present"].includes(states[b]?.activity.kind ?? "") ? 0 : 1;
    return pa - pb;
  });
  for (const id of order) {
    const act = states[id]?.activity ?? { kind: "desk" };
    switch (act.kind) {
      case "desk":
        claim(id, [`${id}:desk`]);
        break;
      case "workstation":
        claim(id, [`${id}:workstation`, `${id}:desk`]);
        break;
      case "meeting": {
        const seats = Array.from({ length: 9 }, (_, i) => `boardroom:seat:${((act.seat ?? 0) + i) % 9}`);
        claim(id, seats);
        break;
      }
      case "present":
        claim(id, ["boardroom:presenter", "boardroom:seat:0"]);
        break;
      case "collaborate":
      case "handoff":
        claim(id, act.withAgent ? ALTERNATES(act.withAgent) : [`${id}:collab`]);
        break;
      case "break": {
        const n = BREAK_SPOTS.length;
        const start = (act.seat ?? 0) % n;
        claim(id, Array.from({ length: n }, (_, i) => BREAK_SPOTS[(start + i) % n]));
        break;
      }
      case "idle":
        claim(id, [`${id}:collab`, `${id}:collab2`, `${id}:desk`]);
        break;
    }
  }
  return out;
}

// --- Pose targets ------------------------------------------------------------------------------

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function standBase(p: Pose, t: number, seed: number) {
  p.pelvisY = L.pelvisY - 0.004 * (1 + Math.sin(t * 1.4 + seed));
  p.spinePitch = 0.015 * Math.sin(t * 1.3 + seed);
  p.spineYaw = 0;
  p.hip[0] = 0.02;
  p.hip[1] = -0.02;
  p.hipRoll[0] = 0.03;
  p.hipRoll[1] = -0.03;
  p.knee[0] = 0.04;
  p.knee[1] = 0.04;
  p.shPitch[0] = 0.04;
  p.shPitch[1] = 0.04;
  p.shRoll[0] = 0.07;
  p.shRoll[1] = -0.07;
  p.elbow[0] = -0.15;
  p.elbow[1] = -0.15;
  p.cup = 0;
}

function sitBase(p: Pose, t: number, seed: number) {
  p.pelvisY = 0.5;
  p.spinePitch = 0.06 + 0.01 * Math.sin(t * 1.2 + seed);
  p.spineYaw = 0;
  p.hip[0] = -1.48;
  p.hip[1] = -1.48;
  p.hipRoll[0] = 0.07;
  p.hipRoll[1] = -0.07;
  p.knee[0] = 1.4;
  p.knee[1] = 1.4;
  p.shPitch[0] = -0.2;
  p.shPitch[1] = -0.2;
  p.shRoll[0] = 0.1;
  p.shRoll[1] = -0.1;
  p.elbow[0] = -0.9;
  p.elbow[1] = -0.9;
  p.cup = 0;
}

function walkPose(p: Pose, phase: number) {
  const s = Math.sin(phase);
  p.pelvisY = L.pelvisY - 0.018 * Math.abs(Math.cos(phase));
  p.spinePitch = 0.04;
  p.spineYaw = 0.06 * s;
  p.hip[0] = -0.42 * s;
  p.hip[1] = 0.42 * s;
  p.hipRoll[0] = 0.02;
  p.hipRoll[1] = -0.02;
  p.knee[0] = 0.08 + 0.75 * Math.max(0, Math.sin(phase + 1.1));
  p.knee[1] = 0.08 + 0.75 * Math.max(0, Math.sin(phase + 1.1 + Math.PI));
  p.shPitch[0] = 0.34 * s;
  p.shPitch[1] = -0.34 * s;
  p.shRoll[0] = 0.08;
  p.shRoll[1] = -0.08;
  p.elbow[0] = -0.28 - 0.12 * Math.max(0, -s);
  p.elbow[1] = -0.28 - 0.12 * Math.max(0, s);
  p.neckPitch = 0.05;
  p.neckYaw = 0;
  p.cup = 0;
}

/** Point the head at a world-space target (clamped). */
function lookAtWorld(fig: Fig, p: Pose, target: [number, number, number] | undefined, t: number) {
  const idle = 0.12 * Math.sin(t * 0.37 + fig.seed) + 0.05 * Math.sin(t * 1.1 + fig.seed * 2);
  if (!target) {
    p.neckYaw = idle;
    p.neckPitch = 0.04;
    return;
  }
  fig.rig.root.updateMatrixWorld(true);
  tmpV.set(...target);
  fig.rig.spine.worldToLocal(tmpV);
  const headY = L.neckY + 0.17;
  const dx = tmpV.x;
  const dz = tmpV.z;
  const dy = tmpV.y - headY;
  p.neckYaw = THREE.MathUtils.clamp(Math.atan2(dx, Math.max(0.05, dz)), -0.9, 0.9) + idle * 0.35;
  p.neckPitch = THREE.MathUtils.clamp(-Math.atan2(dy, Math.hypot(dx, dz)), -0.4, 0.55);
}

function targetFor(fig: Fig, state: AgentState | null, t: number) {
  const p = fig.target;
  const s = fig.scale;
  const ik: { side: 0 | 1; at: THREE.Vector3 }[] = [];
  const hand = (side: 0 | 1, x: number, y: number, z: number) => ik.push({ side, at: v3(x / s, y / s, z / s) });

  if (fig.id === "visitor") {
    const pr = presence.get("visitor");
    if (pr && fig.speed > 0.15) walkPose(p, fig.phase);
    else standBase(p, t, fig.seed);
    p.neckYaw = 0;
    p.neckPitch = 0.03;
    return ik;
  }
  if (fig.walking || !fig.spot) {
    walkPose(p, fig.phase);
    return ik;
  }
  const spot = fig.spot;
  const kind = fig.id === "concierge" ? "concierge" : state?.activity.kind ?? "desk";
  const status = state?.status ?? "working";
  const seed = fig.seed;

  if (spot.pose === "sit") {
    sitBase(p, t, seed);
    lookAtWorld(fig, p, spot.lookAt, t);
    if (kind === "meeting") {
      p.spinePitch = 0.08;
      hand(0, 0.15, 0.79, 0.52);
      hand(1, -0.15, 0.79, 0.52 + 0.02 * Math.sin(t * 0.7 + seed));
      return ik;
    }
    switch (status) {
      case "working": {
        p.spinePitch = 0.14;
        const tap = (k: number) => 0.012 * Math.max(0, Math.sin(t * 13 + seed + k));
        hand(0, 0.13, 0.785 + tap(0), 0.6);
        hand(1, -0.13, 0.785 + tap(1.7), 0.6);
        p.neckPitch += 0.06;
        break;
      }
      case "analysing": {
        const thinking = Math.sin(t * 0.45 + seed) > 0.35;
        p.spinePitch = thinking ? 0.18 : 0.08;
        hand(1, -0.3 + 0.02 * Math.sin(t * 2.1 + seed), 0.79, 0.56 + 0.015 * Math.sin(t * 1.7));
        if (thinking) hand(0, 0.05, 1.1, 0.24);
        else hand(0, 0.2, 0.785, 0.48);
        break;
      }
      case "waiting":
        p.spinePitch = 0.03;
        hand(0, 0.05, 0.79, 0.44);
        hand(1, -0.05, 0.79, 0.44);
        p.neckYaw *= 0.6;
        break;
      case "idle":
        p.spinePitch = -0.1;
        hand(0, 0.13, 0.6, 0.3);
        hand(1, -0.13, 0.6, 0.3);
        break;
      case "error":
        p.spinePitch = 0.24 + 0.03 * Math.sin(t * 2);
        p.neckPitch = 0.35;
        p.neckYaw = 0.12 * Math.sin(t * 1.6);
        hand(0, 0.03, 1.18, 0.2);
        hand(1, -0.2, 0.785, 0.5);
        break;
    }
    return ik;
  }

  // Standing spots.
  standBase(p, t, seed);
  switch (kind) {
    case "concierge":
      lookAtWorld(fig, p, [-30, 1.5, 4 + 6 * Math.sin(t * 0.2)], t);
      p.spinePitch = 0.08;
      hand(0, 0.2, 0.79, 0.42);
      hand(1, -0.2 + 0.03 * Math.sin(t * 3), 0.79, 0.42);
      break;
    case "present": {
      const pointing = Math.sin(t * 0.5 + seed) > 0.2;
      lookAtWorld(fig, p, pointing ? [30.5, 1.9, 2.45] : spot.lookAt, t);
      if (pointing) {
        p.shPitch[1] = -0.55;
        p.shRoll[1] = -1.2;
        p.elbow[1] = -0.12;
      } else {
        p.elbow[1] = -1.1 + 0.2 * Math.sin(t * 2.2);
        p.shPitch[1] = -0.25;
      }
      p.elbow[0] = -1.0 + 0.25 * Math.sin(t * 1.9 + 1);
      p.shPitch[0] = -0.2;
      break;
    }
    case "collaborate":
    case "handoff": {
      lookAtWorld(fig, p, spot.lookAt, t);
      const a = Math.sin(t * 2.3 + seed);
      const b = Math.sin(t * 1.7 + seed + 2);
      p.spinePitch = 0.1;
      p.shPitch[0] = -0.35 + 0.12 * a;
      p.elbow[0] = -1.1 + 0.25 * b;
      p.shPitch[1] = -0.2 + 0.1 * b;
      p.elbow[1] = -0.9 + 0.3 * a;
      p.neckPitch += 0.06 * Math.sin(t * 3.1 + seed);
      break;
    }
    case "break": {
      lookAtWorld(fig, p, spot.lookAt, t);
      const sip = Math.sin(t * 0.8 + seed) > 0.85;
      hand(1, sip ? -0.04 : -0.12, sip ? 1.43 : 1.13, sip ? 0.16 : 0.27);
      hand(0, 0.16, 1.07, 0.36);
      p.cup = 1;
      if (sip) p.neckPitch = -0.15;
      break;
    }
    default: {
      // idle at the high table
      lookAtWorld(fig, p, spot.lookAt, t);
      p.spinePitch = 0.12;
      hand(0, 0.16, 1.07, 0.36);
      hand(1, -0.16, 1.07, 0.36);
    }
  }
  return ik;
}

// --- Component ---------------------------------------------------------------------------------

function useFigures() {
  return useMemo(() => {
    const list: { id: FigId; look: Appearance }[] = [
      ...agents.map((a) => ({ id: a.id as FigId, look: a.appearance })),
      { id: "concierge", look: CONCIERGE_LOOK },
      { id: "visitor", look: VISITOR_LOOK },
    ];
    return list.map(({ id, look }, idx): Fig => {
      const rig = new FigureRig(look);
      const scale = 0.97 * look.height;
      rig.root.scale.setScalar(scale);
      const pose = newPose();
      return {
        idx,
        id,
        rig,
        scale,
        pose,
        target: newPose(),
        x: 0,
        z: 0,
        yaw: 0,
        spot: null,
        spotKey: null,
        targetKey: null,
        path: [],
        pi: 0,
        walking: false,
        pendingSpot: null,
        settled: false,
        phase: Math.random() * 6,
        seed: idx * 1.37 + 0.5,
        speed: 0,
      };
    });
  }, []);
}

const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 16);

export function Agents() {
  const figs = useFigures();
  const cameraMode = useHub((s) => s.cameraMode);
  const showLabels = useHub((s) => s.showLabels);
  const agentStates = useHub((s) => s.agents);
  const selected = useHub((s) => s.selected);
  const hovered = useHub((s) => s.hovered);

  // Instanced meshes, one per body part.
  const { meshes, geos, mats } = useMemo(() => {
    const geos = {
      capsuleLimb: capsule(0.07, 0.3),
      capsuleArm: capsule(0.05, 0.2),
      capsuleTorso: capsule(0.15, 0.26),
      sphere: new THREE.SphereGeometry(0.5, 24, 18),
      rbox: new RoundedBoxGeometry(1, 1, 1, 3, 0.2),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
      icosa: (() => {
        const g = new THREE.IcosahedronGeometry(0.5, 1);
        g.computeVertexNormals();
        return g;
      })(),
    };
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ color: "#ffffff", ...p });
    const mats = {
      skin: std({ roughness: 0.58 }),
      cloth: std({ roughness: 0.8 }),
      shirt: std({ roughness: 0.65 }),
      hair: std({ roughness: 0.55 }),
      shoe: std({ roughness: 0.28, metalness: 0.15 }),
      gold: std({ roughness: 0.25, metalness: 1, color: "#ffffff" }),
      ceramic: std({ roughness: 0.2 }),
    };
    const meshes = new Map<PartKey, THREE.InstancedMesh>();
    (Object.keys(PARTS) as PartKey[]).forEach((key) => {
      const spec = PARTS[key];
      const count = figs.length * spec.perFigure;
      const m = new THREE.InstancedMesh(geos[spec.geo], mats[spec.mat], count);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.raycast = () => {};
      m.name = `figure:${key}`;
      meshes.set(key, m);
    });
    // Colours are fixed per figure.
    const counters = new Map<PartKey, number>();
    figs.forEach((f) => {
      counters.clear();
      for (const slot of f.rig.slots) {
        const spec = PARTS[slot.key];
        const k = counters.get(slot.key) ?? 0;
        counters.set(slot.key, k + 1);
        meshes.get(slot.key)!.setColorAt(f.idx * spec.perFigure + k, slot.color);
      }
    });
    meshes.forEach((m) => m.instanceColor && (m.instanceColor.needsUpdate = true));
    return { meshes, geos, mats };
  }, [figs]);

  useEffect(
    () => () => {
      meshes.forEach((m) => m.dispose());
      Object.values(geos).forEach((g) => g.dispose());
      Object.values(mats).forEach((m) => m.dispose());
    },
    [meshes, geos, mats],
  );

  // Status rings + picking volumes.
  const ringRef = useRef<THREE.InstancedMesh>(null!);
  const hitRef = useRef<THREE.InstancedMesh>(null!);
  const selRef = useRef<THREE.Mesh>(null!);
  const labelRefs = useRef<(THREE.Group | null)[]>([]);

  // Initial placement: everyone starts at their desk.
  useEffect(() => {
    const desired = desiredSpots(useHub.getState().agents);
    for (const f of figs) {
      const key = f.id === "concierge" ? "reception:concierge" : f.id === "visitor" ? null : desired[f.id as AgentId];
      if (!key) continue;
      const sp = floorplan.spots[key];
      f.x = sp.x;
      f.z = sp.z;
      f.yaw = sp.yaw;
      f.spot = sp;
      f.spotKey = key;
      f.targetKey = key;
      f.settled = true;
      if (sp.pose === "sit") {
        f.pose.pelvisY = 0.5;
        f.pose.hip = [-1.48, -1.48];
        f.pose.knee = [1.4, 1.4];
      }
    }
  }, [figs]);

  // React to activity changes: route figures to their new spots.
  useEffect(() => {
    const desired = desiredSpots(agentStates);
    for (const f of figs) {
      if (f.id === "concierge" || f.id === "visitor") continue;
      const key = desired[f.id as AgentId];
      if (!key) continue;
      const heading = f.walking ? f.pendingSpot ?? f.targetKey : f.spotKey;
      if (key === heading) continue;
      if (f.walking) f.pendingSpot = key === f.targetKey ? null : key;
      else startRoute(f, key);
    }
  }, [agentStates, figs]);

  // Ring colours follow status.
  useEffect(() => {
    const ring = ringRef.current;
    if (!ring) return;
    const c = new THREE.Color();
    agents.forEach((a, i) => {
      c.set(STATUS_META[agentStates[a.id]?.status ?? "idle"].color);
      ring.setColorAt(i, c);
    });
    c.set("#c4a66a");
    ring.setColorAt(agents.length, c);
    if (ring.instanceColor) ring.instanceColor.needsUpdate = true;
  }, [agentStates]);

  const clock = useRef(0);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    clock.current += dt;
    const t = clock.current;
    const states = useHub.getState().agents;
    const sel = useHub.getState().selected;
    const hov = useHub.getState().hovered;
    const visitorVisible = useHub.getState().cameraMode === "third";
    const m4 = tmpM;

    for (const f of figs) {
      const st = f.id === "concierge" || f.id === "visitor" ? null : states[f.id as AgentId];

      // --- locomotion
      if (f.id === "visitor") {
        const pr = presence.get("visitor");
        if (pr) {
          const moved = Math.hypot(pr.x - f.x, pr.z - f.z);
          f.speed = THREE.MathUtils.damp(f.speed, moved / Math.max(dt, 1e-3), 10, dt);
          f.phase += (moved * Math.PI * 2) / 1.45;
          f.x = pr.x;
          f.z = pr.z;
          f.yaw = pr.yaw;
        }
      } else if (f.walking) {
        const standingUp = f.pose.pelvisY < 0.85;
        if (!standingUp) {
          const wp = f.path[f.pi];
          const dx = wp.x - f.x;
          const dz = wp.z - f.z;
          const dist = Math.hypot(dx, dz);
          const step = WALK_SPEED * f.scale * dt;
          if (dist <= step) {
            f.x = wp.x;
            f.z = wp.z;
            f.pi++;
            if (f.pendingSpot && wp.door) {
              const next = f.pendingSpot;
              f.pendingSpot = null;
              f.spot = null;
              startRoute(f, next);
            } else if (f.pi >= f.path.length) {
              f.walking = false;
              f.spotKey = f.targetKey;
              f.spot = f.spotKey ? floorplan.spots[f.spotKey] : null;
              f.path = [];
              if (f.pendingSpot && f.pendingSpot !== f.spotKey) {
                const next = f.pendingSpot;
                f.pendingSpot = null;
                startRoute(f, next);
              } else f.pendingSpot = null;
            }
          } else {
            f.x += (dx / dist) * step;
            f.z += (dz / dist) * step;
            f.phase += (step * Math.PI * 2) / 1.45;
            const heading = Math.atan2(dx, dz);
            f.yaw = dampAngle(f.yaw, heading, 10, dt);
          }
        }
      }
      if (!f.walking && f.spot && f.id !== "visitor") {
        f.yaw = dampAngle(f.yaw, f.spot.yaw, 6, dt);
        f.settled = Math.abs(angleDiff(f.yaw, f.spot.yaw)) < 0.12;
      }

      // --- pose
      f.rig.root.position.set(f.x, 0, f.z);
      f.rig.root.rotation.y = f.yaw;
      applyPose(f.rig, f.pose); // matrices for IK/look use the current pose
      let ik: { side: 0 | 1; at: THREE.Vector3 }[] = [];
      if (f.walking) walkPose(f.target, f.phase);
      else if (!f.settled && f.spot?.pose === "sit") standBase(f.target, t, f.seed); // turn first, then sit
      else ik = targetFor(f, st, t);
      for (const h of ik) solveArmIK(f.rig, f.target, h.side, h.at);
      const k = f.walking ? 14 : 6;
      dampPose(f.pose, f.target, k, dt);
      applyPose(f.rig, f.pose);
      f.rig.root.updateMatrixWorld(true);

      // --- write instances
      const hidden = f.id === "visitor" && !visitorVisible;
      const counters: Partial<Record<PartKey, number>> = {};
      for (const slot of f.rig.slots) {
        const spec = PARTS[slot.key];
        const kk = counters[slot.key] ?? 0;
        counters[slot.key] = kk + 1;
        const mesh = meshes.get(slot.key)!;
        const vis = !hidden && slot.visible && (slot.key !== "cup" || f.rig.cupSlot.visible);
        mesh.setMatrixAt(f.idx * spec.perFigure + kk, vis ? slot.node.matrixWorld : ZERO);
      }

      // --- presence for the simulator / minimap
      if (f.id !== "visitor") {
        presence.set(f.id, { x: f.x, z: f.z, yaw: f.yaw, spotKey: f.walking ? null : f.spotKey, settled: !f.walking && f.settled });
      }

      // --- ring, hit volume, label anchor
      if (f.id !== "visitor") {
        f.rig.head.getWorldPosition(tmpV);
        const i = f.idx;
        const pulse =
          st && (st.status === "analysing" || st.status === "error" || st.status === "waiting")
            ? 1 + 0.18 * Math.sin(t * (st.status === "error" ? 9 : 4) + f.seed)
            : 1;
        m4.compose(
          tmpV2.set(tmpV.x, tmpV.y + 0.36 + 0.025 * Math.sin(t * 2 + f.seed), tmpV.z),
          tmpQ.setFromEuler(tmpE.set(Math.PI / 2, 0, t * 0.8)),
          tmpS.set(pulse, pulse, pulse),
        );
        ringRef.current?.setMatrixAt(i, m4);
        m4.compose(tmpV2.set(f.x, (f.pose.pelvisY + 0.85) / 2, f.z), IDENTITY_Q, tmpS.set(0.7, f.pose.pelvisY + 0.9, 0.7));
        hitRef.current?.setMatrixAt(i, m4);
        const lab = labelRefs.current[i];
        if (lab) lab.position.set(tmpV.x, tmpV.y + 0.62, tmpV.z);
      }
    }
    meshes.forEach((m) => (m.instanceMatrix.needsUpdate = true));
    if (ringRef.current) ringRef.current.instanceMatrix.needsUpdate = true;
    if (hitRef.current) {
      hitRef.current.instanceMatrix.needsUpdate = true;
      hitRef.current.computeBoundingSphere();
    }

    // Selection marker on the floor.
    const focus = (sel ?? hov) as FigId | null;
    const target = focus ? figs.find((f) => f.id === focus) : null;
    if (selRef.current) {
      selRef.current.visible = !!target;
      if (target) {
        selRef.current.position.set(target.x, 0.02, target.z);
        selRef.current.rotation.z = t * 0.6;
        const s = sel === focus ? 1 : 0.85;
        selRef.current.scale.setScalar(s * (1 + 0.04 * Math.sin(t * 3)));
      }
    }
    void state;
  });

  const onPick = (e: ThreeEvent<PointerEvent | MouseEvent>, kind: "over" | "out" | "click") => {
    const i = e.instanceId;
    if (i === undefined) return;
    const id = figs[i]?.id;
    if (!id || id === "visitor") return;
    if (kind === "click") {
      e.stopPropagation();
      useHub.getState().select(id as AgentId | "concierge");
    } else if (kind === "over") {
      e.stopPropagation();
      useHub.getState().set({ hovered: id as AgentId | "concierge" });
      document.body.style.cursor = "pointer";
    } else {
      useHub.getState().set({ hovered: null });
      document.body.style.cursor = "";
    }
  };

  const nPick = agents.length + 1; // agents + concierge
  return (
    <group>
      {[...meshes.values()].map((m) => (
        <primitive key={m.name} object={m} />
      ))}
      <instancedMesh ref={ringRef} args={[undefined, undefined, nPick]} frustumCulled={false} raycast={() => null}>
        <torusGeometry args={[0.13, 0.022, 10, 40]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={hitRef}
        args={[undefined, undefined, nPick]}
        onPointerOver={(e) => onPick(e, "over")}
        onPointerOut={(e) => onPick(e, "out")}
        onClick={(e) => onPick(e, "click")}
      >
        <boxGeometry />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </instancedMesh>
      <mesh ref={selRef} rotation-x={-Math.PI / 2} visible={false} raycast={() => null}>
        <ringGeometry args={[0.42, 0.5, 48, 1, 0, Math.PI * 1.8]} />
        <meshBasicMaterial color="#c4a66a" toneMapped={false} transparent opacity={0.95} />
      </mesh>
      {cameraMode !== "first" &&
        figs.slice(0, nPick).map((f, i) => {
          const id = f.id as AgentId | "concierge";
          const isAgent = id !== "concierge";
          const show = showLabels || selected === id || hovered === id;
          const st = isAgent ? agentStates[id as AgentId] : null;
          return (
            <group key={id} ref={(g) => void (labelRefs.current[i] = g)}>
              {show && (
                <Html center distanceFactor={13} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
                  <div className={`agent-tag ${selected === id ? "is-selected" : ""}`}>
                    <span className="agent-tag__dot" style={{ background: st ? STATUS_META[st.status].color : "#c4a66a" }} />
                    {isAgent ? agentById[id as AgentId].name.replace(/^HN /, "").replace(/ AI$/, "") : "Concierge"}
                  </div>
                </Html>
              )}
            </group>
          );
        })}
    </group>
  );

  function startRoute(f: Fig, key: string) {
    const to = floorplan.spots[key];
    if (!to) return;
    f.targetKey = key;
    f.path = routeBetween({ x: f.x, z: f.z, spot: f.spot ?? undefined }, to);
    f.pi = 0;
    f.walking = f.path.length > 0;
    f.settled = false;
    if (!f.walking) {
      f.spot = to;
      f.spotKey = key;
    }
  }
}

function angleDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function dampAngle(a: number, b: number, k: number, dt: number) {
  return a + angleDiff(a, b) * (1 - Math.exp(-k * dt));
}
