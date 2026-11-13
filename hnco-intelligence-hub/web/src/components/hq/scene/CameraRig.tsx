"use client";

import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { FLOOR, floorplan, zoneById } from "@/lib/floorplan";
import { cameraPresence, presence } from "@/lib/presence";
import { useHub } from "@/lib/store";
import type { AgentId } from "@/lib/types";

// --- Shared input & commands (driven by keyboard, on-screen controls and UI buttons) -----------

export const moveInput = { forward: 0, right: 0, run: false };
export const rigCommands = {
  zoom: (_factor: number) => {},
  rotate: (_radians: number) => {},
  overview: () => {},
};

const keys = new Set<string>();
const typing = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
};

// --- Collision ---------------------------------------------------------------------------------

const RADIUS = 0.3;
function collide(x: number, z: number): [number, number] {
  for (let pass = 0; pass < 2; pass++) {
    for (const w of floorplan.walls) {
      const [ax, az] = w.a;
      const [bx, bz] = w.b;
      const dx = bx - ax;
      const dz = bz - az;
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const px = ax + t * dx;
      const pz = az + t * dz;
      const ox = x - px;
      const oz = z - pz;
      const d = Math.hypot(ox, oz);
      if (d < RADIUS && d > 1e-6) {
        x = px + (ox / d) * RADIUS;
        z = pz + (oz / d) * RADIUS;
      }
    }
    for (const o of floorplan.obstacles) {
      const cx = Math.max(o.x0, Math.min(o.x1, x));
      const cz = Math.max(o.z0, Math.min(o.z1, z));
      const ox = x - cx;
      const oz = z - cz;
      const d = Math.hypot(ox, oz);
      if (d < RADIUS) {
        if (d > 1e-6) {
          x = cx + (ox / d) * RADIUS;
          z = cz + (oz / d) * RADIUS;
        }
      }
    }
  }
  // Stay within the site.
  x = Math.max(FLOOR.minX - 20, Math.min(FLOOR.maxX + 20, x));
  z = Math.max(FLOOR.minZ - 20, Math.min(FLOOR.maxZ + 25, z));
  return [x, z];
}

// --- Rig ---------------------------------------------------------------------------------------

const EYE = 1.62;
const ISO_POLAR = Math.atan(Math.SQRT2); // true isometric elevation
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Fly = { from: THREE.Vector3; to: THREE.Vector3; fromT: THREE.Vector3; toT: THREE.Vector3; t: number; dur: number } | null;

function overviewPose(aspect: number) {
  const vfov = THREE.MathUtils.degToRad(42);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const dist = Math.max(40 / Math.tan(hfov / 2), 30 / Math.tan(vfov / 2)) * 0.95;
  const elev = THREE.MathUtils.degToRad(52);
  return {
    position: new THREE.Vector3(0, Math.sin(elev) * dist, Math.cos(elev) * dist + 2),
    target: new THREE.Vector3(0, 0, 2),
  };
}

export function CameraRig() {
  const mode = useHub((s) => s.cameraMode);
  const flyTo = useHub((s) => s.flyTo);
  const entered = useHub((s) => s.entered);
  const selected = useHub((s) => s.selected);
  const controls = useRef<OrbitControlsImpl>(null);
  const persp = useRef<THREE.PerspectiveCamera>(null!);
  const ortho = useRef<THREE.OrthographicCamera>(null!);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const fly = useRef<Fly>(null);
  const view = useRef({ yaw: Math.PI, pitch: -0.05, camYaw: Math.PI, camPitch: 0.32 });
  const visitor = useRef({ x: -30, z: 15, yaw: Math.PI });
  const followPrev = useRef(new THREE.Vector3());

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing()) return;
      keys.add(e.code);
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    const blur = () => keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Drag to look in first/third person (works for mouse and touch, no pointer lock needed).
  useEffect(() => {
    if (mode !== "first" && mode !== "third") return;
    const el = gl.domElement;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    const down = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
      const v = view.current;
      if (mode === "first") {
        v.yaw -= dx * 0.004;
        v.pitch = THREE.MathUtils.clamp(v.pitch - dy * 0.003, -1.1, 1.0);
      } else {
        v.camYaw -= dx * 0.005;
        v.camPitch = THREE.MathUtils.clamp(v.camPitch + dy * 0.003, 0.05, 1.2);
      }
    };
    const up = () => (dragging = false);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [mode, gl]);

  // Entering first/third person: start from the orbit target (or the entrance) at ground level.
  useEffect(() => {
    if (mode !== "first" && mode !== "third") return;
    const c = controls.current;
    const t = c?.target;
    if (t && t.x > FLOOR.minX && t.x < FLOOR.maxX && t.z > FLOOR.minZ && t.z < FLOOR.maxZ) {
      const [x, z] = collide(t.x, t.z + 2);
      visitor.current.x = x;
      visitor.current.z = z;
    }
    view.current.yaw = visitor.current.yaw;
    view.current.camYaw = visitor.current.yaw;
    view.current.pitch = -0.05;
  }, [mode]);

  // Commands for UI buttons.
  useEffect(() => {
    rigCommands.zoom = (f: number) => {
      const m = useHub.getState().cameraMode;
      if (m === "isometric" && ortho.current) {
        ortho.current.zoom = THREE.MathUtils.clamp(ortho.current.zoom * (1 / f), 4, 60);
        ortho.current.updateProjectionMatrix();
      } else if ((m === "orbit" || m === "follow") && controls.current) {
        const c = controls.current;
        const off = persp.current.position.clone().sub(c.target).multiplyScalar(f);
        if (off.length() > 3 && off.length() < 120) persp.current.position.copy(c.target).add(off);
      } else if (persp.current) {
        persp.current.fov = THREE.MathUtils.clamp(persp.current.fov * f, 25, 75);
        persp.current.updateProjectionMatrix();
      }
    };
    rigCommands.rotate = (r: number) => {
      const m = useHub.getState().cameraMode;
      if (m === "first") view.current.yaw += r;
      else if (m === "third") view.current.camYaw += r;
      else if (controls.current) {
        const c = controls.current;
        const cam = m === "isometric" ? ortho.current : persp.current;
        const off = cam.position.clone().sub(c.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), r);
        cam.position.copy(c.target).add(off);
        c.update();
      }
    };
    rigCommands.overview = () => {
      const p = overviewPose(size.width / size.height);
      startFly(p.position, p.target, 1.4);
    };
  });

  function startFly(to: THREE.Vector3, toT: THREE.Vector3, dur: number) {
    const c = controls.current;
    if (!c || !persp.current) return;
    fly.current = { from: persp.current.position.clone(), to, fromT: c.target.clone(), toT, t: 0, dur };
  }

  // Intro fly-in from outside the entrance.
  useEffect(() => {
    if (!persp.current || !controls.current) return;
    const p = overviewPose(size.width / size.height);
    if (!entered) {
      persp.current.position.set(-30, 2.4, 38);
      controls.current.target.set(-30, 2.6, 10);
      controls.current.update();
    } else {
      startFly(p.position, p.target, 3.2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered]);

  // Department navigation.
  useEffect(() => {
    if (!flyTo) return;
    const z = zoneById[flyTo.zone];
    if (!z) return;
    if (mode === "isometric" && controls.current && ortho.current) {
      const c = controls.current;
      const d = new THREE.Vector3((z.rect.x0 + z.rect.x1) / 2, 0, (z.rect.z0 + z.rect.z1) / 2).sub(c.target);
      c.target.add(d);
      ortho.current.position.add(d);
      ortho.current.zoom = 22;
      ortho.current.updateProjectionMatrix();
      return;
    }
    startFly(new THREE.Vector3(...z.vantage.position), new THREE.Vector3(...z.vantage.target), 1.6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  useEffect(() => {
    if (mode === "follow" && selected && selected !== "concierge") {
      const p = presence.get(selected as AgentId);
      if (p) followPrev.current.set(p.x, 0, p.z);
      const c = controls.current;
      if (p && c && persp.current) {
        startFly(new THREE.Vector3(p.x + 5, 6, p.z + 7), new THREE.Vector3(p.x, 1, p.z), 1.2);
      }
    }
  }, [mode, selected]);

  // Leaving first/third person: put the orbit camera above where the visitor stood.
  const prevMode = useRef(mode);
  useEffect(() => {
    const was = prevMode.current;
    prevMode.current = mode;
    if ((was === "first" || was === "third") && (mode === "orbit" || mode === "follow") && controls.current && persp.current) {
      const { x, z } = visitor.current;
      controls.current.target.set(x, 0.8, z);
      persp.current.position.set(x + 7, 10, z + 9);
      controls.current.update();
    }
  }, [mode]);

  useEffect(() => {
    if (mode === "isometric" && ortho.current && controls.current) {
      const t = controls.current.target;
      ortho.current.position.set(t.x + 60, 60 * Math.tan(Math.PI / 2 - ISO_POLAR) * Math.SQRT2, t.z + 60);
      ortho.current.zoom = Math.min(size.width / 82, size.height / 52);
      ortho.current.updateProjectionMatrix();
      controls.current.update();
    }
  }, [mode, size.width, size.height]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const c = controls.current;

    if (fly.current && c && persp.current) {
      const f = fly.current;
      f.t = Math.min(1, f.t + dt / f.dur);
      const k = ease(f.t);
      persp.current.position.lerpVectors(f.from, f.to, k);
      c.target.lerpVectors(f.fromT, f.toT, k);
      c.update();
      if (f.t >= 1) fly.current = null;
    }

    if ((mode === "first" || mode === "third") && persp.current) {
      const v = view.current;
      const kf = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) + moveInput.forward;
      const kr = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) + moveInput.right;
      const run = keys.has("ShiftLeft") || keys.has("ShiftRight") || moveInput.run;
      const speed = (run ? 5.5 : 2.6) * dt;
      const heading = mode === "first" ? v.yaw : v.camYaw;
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      let nx = visitor.current.x + (fx * kf - fz * kr) * speed;
      let nz = visitor.current.z + (fz * kf + fx * kr) * speed;
      [nx, nz] = collide(nx, nz);
      const moving = Math.hypot(nx - visitor.current.x, nz - visitor.current.z) > 1e-4;
      if (moving && mode === "third") {
        const want = Math.atan2(nx - visitor.current.x, nz - visitor.current.z);
        let d = want - visitor.current.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        visitor.current.yaw += d * (1 - Math.exp(-12 * dt));
      }
      if (mode === "first") visitor.current.yaw = v.yaw;
      visitor.current.x = nx;
      visitor.current.z = nz;
      presence.set("visitor", { x: nx, z: nz, yaw: visitor.current.yaw, spotKey: null, settled: true });

      const cam = persp.current;
      if (mode === "first") {
        cam.position.set(nx, EYE, nz);
        const dir = new THREE.Vector3(Math.sin(v.yaw) * Math.cos(v.pitch), Math.sin(v.pitch), Math.cos(v.yaw) * Math.cos(v.pitch));
        cam.lookAt(cam.position.clone().add(dir));
      } else {
        const dist = 4.2;
        const back = new THREE.Vector3(
          -Math.sin(v.camYaw) * Math.cos(v.camPitch) * dist,
          Math.sin(v.camPitch) * dist + 1.4,
          -Math.cos(v.camYaw) * Math.cos(v.camPitch) * dist,
        );
        const want = new THREE.Vector3(nx, 0, nz).add(back);
        cam.position.lerp(want, 1 - Math.exp(-10 * dt));
        cam.lookAt(nx, 1.45, nz);
      }
    }

    if (mode === "follow" && c && selected && selected !== "concierge" && !fly.current) {
      const p = presence.get(selected as AgentId);
      if (p) {
        const now = new THREE.Vector3(p.x, 0, p.z);
        const delta = now.clone().sub(followPrev.current);
        followPrev.current.copy(now);
        c.target.add(delta);
        persp.current.position.add(delta);
        c.update();
      }
    }

    // Minimap camera marker.
    const cam = mode === "isometric" ? ortho.current : persp.current;
    if (cam) {
      const dir = new THREE.Vector3();
      cam.getWorldDirection(dir);
      cameraPresence.x = mode === "first" || mode === "third" ? visitor.current.x : c?.target.x ?? cam.position.x;
      cameraPresence.z = mode === "first" || mode === "third" ? visitor.current.z : c?.target.z ?? cam.position.z;
      cameraPresence.yaw = Math.atan2(dir.x, dir.z);
    }
  });

  const orbitLike = mode === "orbit" || mode === "follow";
  return (
    <>
      <PerspectiveCamera ref={persp} makeDefault={mode !== "isometric"} fov={42} near={0.1} far={2000} position={[-30, 2.4, 38]} />
      <OrthographicCamera ref={ortho} makeDefault={mode === "isometric"} near={-500} far={2000} zoom={14} position={[60, 49, 62]} />
      <OrbitControls
          ref={controls as never}
          makeDefault
          enabled={orbitLike || mode === "isometric"}
          enableDamping
          dampingFactor={0.08}
          maxPolarAngle={mode === "isometric" ? ISO_POLAR : 1.42}
          minPolarAngle={mode === "isometric" ? ISO_POLAR : 0.05}
          minDistance={3}
          maxDistance={130}
          screenSpacePanning={false}
        />
    </>
  );
}
