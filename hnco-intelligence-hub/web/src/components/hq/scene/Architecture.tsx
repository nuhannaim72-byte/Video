"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { FLOOR, floorplan, type Zone } from "@/lib/floorplan";
import { useHub } from "@/lib/store";
import { buildArchitecture, buildCeiling, buildFurniture } from "./furnitureKit";
import { PartBatch } from "./kit";

// --- Procedural floor textures -----------------------------------------------------------------

type FloorKind = Zone["floor"];

function makeCanvas(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d")!, size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const speckle = (c: CanvasRenderingContext2D, s: number, n: number, alpha: number, light = false) => {
  for (let i = 0; i < n; i++) {
    c.fillStyle = light ? `rgba(255,255,255,${Math.random() * alpha})` : `rgba(0,0,0,${Math.random() * alpha})`;
    c.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
};

/** Texture plus the real-world size (m) one repeat covers. */
const FLOOR_TEX: Record<FloorKind, () => { map: THREE.Texture; metres: number; roughness: number; metalness?: number }> = {
  stone: () => ({
    metres: 2.4,
    roughness: 0.32,
    map: makeCanvas(512, (c, s) => {
      c.fillStyle = "#d9d5cd";
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++) {
          c.fillStyle = `hsl(36, 10%, ${82 + Math.random() * 4}%)`;
          c.fillRect(i * (s / 2) + 1, j * (s / 2) + 1, s / 2 - 2, s / 2 - 2);
        }
      speckle(c, s, 5000, 0.06);
      c.strokeStyle = "rgba(90,80,70,0.25)";
      c.lineWidth = 2;
      c.strokeRect(0, 0, s, s);
      c.beginPath();
      c.moveTo(s / 2, 0);
      c.lineTo(s / 2, s);
      c.moveTo(0, s / 2);
      c.lineTo(s, s / 2);
      c.stroke();
    }),
  }),
  marble: () => ({
    metres: 3.2,
    roughness: 0.12,
    map: makeCanvas(1024, (c, s) => {
      c.fillStyle = "#ece9e3";
      c.fillRect(0, 0, s, s);
      for (let v = 0; v < 14; v++) {
        c.strokeStyle = `rgba(150,140,128,${0.08 + Math.random() * 0.12})`;
        c.lineWidth = 0.6 + Math.random() * 1.6;
        c.beginPath();
        let x = Math.random() * s;
        let y = 0;
        c.moveTo(x, y);
        while (y < s) {
          x += (Math.random() - 0.5) * 60;
          y += 20 + Math.random() * 40;
          c.lineTo(x, y);
        }
        c.stroke();
      }
      c.strokeStyle = "rgba(196,166,106,0.35)"; // gold inlay joints
      c.lineWidth = 2;
      c.strokeRect(1, 1, s - 2, s - 2);
    }),
  }),
  oak: () => ({
    metres: 2.0,
    roughness: 0.42,
    map: makeCanvas(512, (c, s) => {
      const planks = 8;
      for (let i = 0; i < planks; i++) {
        const l = 58 + Math.random() * 8;
        c.fillStyle = `hsl(32, 34%, ${l}%)`;
        c.fillRect(0, (i * s) / planks, s, s / planks);
        for (let g = 0; g < 26; g++) {
          c.strokeStyle = `rgba(90,60,30,${Math.random() * 0.12})`;
          c.beginPath();
          const y = (i * s) / planks + Math.random() * (s / planks);
          c.moveTo(0, y);
          c.bezierCurveTo(s * 0.3, y + 3, s * 0.6, y - 3, s, y + 1);
          c.stroke();
        }
        c.fillStyle = "rgba(60,40,20,0.35)";
        c.fillRect(0, (i * s) / planks, s, 1.5);
        c.fillRect(((i * 0.37) % 1) * s, (i * s) / planks, 1.5, s / planks);
      }
    }),
  }),
  walnut: () => ({
    metres: 2.0,
    roughness: 0.34,
    map: makeCanvas(512, (c, s) => {
      const planks = 8;
      for (let i = 0; i < planks; i++) {
        c.fillStyle = `hsl(24, 32%, ${26 + Math.random() * 6}%)`;
        c.fillRect(0, (i * s) / planks, s, s / planks);
        for (let g = 0; g < 30; g++) {
          c.strokeStyle = `rgba(20,10,5,${Math.random() * 0.18})`;
          c.beginPath();
          const y = (i * s) / planks + Math.random() * (s / planks);
          c.moveTo(0, y);
          c.bezierCurveTo(s * 0.3, y + 4, s * 0.7, y - 4, s, y);
          c.stroke();
        }
        c.fillStyle = "rgba(0,0,0,0.4)";
        c.fillRect(0, (i * s) / planks, s, 1.5);
      }
    }),
  }),
  carpet: () => ({
    metres: 1.0,
    roughness: 0.98,
    map: makeCanvas(256, (c, s) => {
      c.fillStyle = "#59636f";
      c.fillRect(0, 0, s, s);
      speckle(c, s, 9000, 0.18);
      speckle(c, s, 4000, 0.06, true);
      c.strokeStyle = "rgba(255,255,255,0.04)";
      for (let i = 0; i < s; i += 8) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, s);
        c.stroke();
      }
    }),
  }),
  carpetNavy: () => ({
    metres: 1.0,
    roughness: 0.98,
    map: makeCanvas(256, (c, s) => {
      c.fillStyle = "#1b2638";
      c.fillRect(0, 0, s, s);
      speckle(c, s, 9000, 0.2);
      speckle(c, s, 2500, 0.05, true);
    }),
  }),
};

function Floors() {
  const meshes = useMemo(() => {
    const cache = new Map<FloorKind, ReturnType<(typeof FLOOR_TEX)[FloorKind]>>();
    return floorplan.zones.map((z) => {
      if (!cache.has(z.floor)) cache.set(z.floor, FLOOR_TEX[z.floor]());
      const base = cache.get(z.floor)!;
      const w = z.rect.x1 - z.rect.x0;
      const d = z.rect.z1 - z.rect.z0;
      const map = base.map.clone();
      map.repeat.set(w / base.metres, d / base.metres);
      map.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({ map, roughness: base.roughness, metalness: base.metalness ?? 0 });
      const geo = new THREE.PlaneGeometry(w, d);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set((z.rect.x0 + z.rect.x1) / 2, 0.002, (z.rect.z0 + z.rect.z1) / 2);
      mesh.receiveShadow = true;
      mesh.name = `floor:${z.id}`;
      return mesh;
    });
  }, []);
  useEffect(
    () => () =>
      meshes.forEach((m) => {
        m.geometry.dispose();
        (m.material as THREE.MeshStandardMaterial).map?.dispose();
        (m.material as THREE.Material).dispose();
      }),
    [meshes],
  );
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} />
      ))}
    </group>
  );
}

// --- Static interior (one batch) ---------------------------------------------------------------

function Interior() {
  const meshes = useMemo(() => {
    const b = new PartBatch();
    buildArchitecture(b);
    for (const f of floorplan.furniture) buildFurniture(b, f);
    return b.build();
  }, []);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);
  return (
    <group>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} raycast={() => null} />
      ))}
    </group>
  );
}

function Ceiling() {
  const mode = useHub((s) => s.cameraMode);
  const meshes = useMemo(() => {
    const b = new PartBatch();
    buildCeiling(b);
    return b.build().map((m) => {
      m.castShadow = false;
      return m;
    });
  }, []);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);
  const visible = mode === "first" || mode === "third";
  return (
    <group visible={visible}>
      {meshes.map((m) => (
        <primitive key={m.name} object={m} raycast={() => null} />
      ))}
    </group>
  );
}

// --- Exterior ----------------------------------------------------------------------------------

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * p;
    gl_Position.z = gl_Position.w; // keep at the far plane
  }
`;
const SKY_FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uSunDir;
  void main() {
    float h = clamp(vDir.y, -0.2, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
    float sun = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
    col += uGlow * pow(sun, 8.0) * 0.55 + uGlow * pow(sun, 200.0) * 1.5;
    col = mix(col, uHorizon * 0.85, smoothstep(0.0, -0.2, vDir.y));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

export const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();

function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color("#5f87b8") },
          uHorizon: { value: new THREE.Color("#f2dcc0") },
          uGlow: { value: new THREE.Color("#ffd9a0") },
          uSunDir: { value: SUN_DIR },
        },
      }),
    [],
  );
  return (
    <mesh material={mat} scale={900} renderOrder={-1} raycast={() => null} frustumCulled={false}>
      <sphereGeometry args={[1, 32, 16]} />
    </mesh>
  );
}

const SKYLINE_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vSeed;
  void main() {
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vSeed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const SKYLINE_FRAG = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vSeed;
  uniform vec3 uSunDir;
  uniform vec3 uFog;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 base = mix(vec3(0.20, 0.25, 0.33), vec3(0.42, 0.48, 0.57), hash(vec2(vSeed)));
    float lit = 0.45 + 0.55 * max(dot(vNormal, uSunDir), 0.0);
    vec3 col = base * lit;
    // window grid on vertical faces
    if (abs(vNormal.y) < 0.5) {
      float u = abs(vNormal.x) > 0.5 ? vWorld.z : vWorld.x;
      vec2 cell = vec2(floor(u / 2.6), floor(vWorld.y / 3.4));
      vec2 f = vec2(fract(u / 2.6), fract(vWorld.y / 3.4));
      float win = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.85);
      // Fade the grid out where a window is smaller than a pixel or two (prevents moiré).
      float fw = max(fwidth(u / 2.6), fwidth(vWorld.y / 3.4));
      win *= 1.0 - smoothstep(0.15, 0.45, fw);
      float on = step(0.62, hash(cell + vSeed));
      col = mix(col, col * 0.55 + vec3(0.25, 0.3, 0.38) * 0.4, win * 0.7);
      col += win * on * vec3(1.0, 0.82, 0.55) * 0.35;
    }
    float d = length(vWorld.xz);
    col = mix(col, uFog, smoothstep(150.0, 520.0, d));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function Skyline() {
  const mesh = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKYLINE_VERT,
      fragmentShader: SKYLINE_FRAG,
      uniforms: { uSunDir: { value: SUN_DIR }, uFog: { value: new THREE.Color("#e9d9c4") } },
    });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const n = 170;
    const m = new THREE.InstancedMesh(geo, mat, n);
    const mtx = new THREE.Matrix4();
    let rnd = 7;
    const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const dist = 170 + r() * 300;
      const x = Math.cos(a) * dist * 1.2;
      const z = Math.sin(a) * dist;
      const h = 12 + Math.pow(r(), 2.4) * 120 * (dist < 260 ? 0.55 : 1);
      const w = 14 + r() * 26;
      const d = 14 + r() * 26;
      mtx.compose(new THREE.Vector3(x, -0.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.round(r() * 3) * 0.2, 0)), new THREE.Vector3(w, h, d));
      m.setMatrixAt(i, mtx);
    }
    m.computeBoundingSphere();
    m.name = "skyline";
    return m;
  }, []);
  return <primitive object={mesh} raycast={() => null} />;
}

function Grounds() {
  const { plaza, trees } = useMemo(() => {
    const tex = makeCanvas(512, (c, s) => {
      c.fillStyle = "#8f8a82";
      c.fillRect(0, 0, s, s);
      for (let i = 0; i < 8; i++)
        for (let j = 0; j < 8; j++) {
          c.fillStyle = `hsl(30, 5%, ${52 + Math.random() * 7}%)`;
          c.fillRect(i * 64 + 1, j * 64 + 1, 62, 62);
        }
      speckle(c, s, 6000, 0.08);
    });
    tex.repeat.set(60, 60);
    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(480, 480),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, color: "#c9c5bd" }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = -0.25;
    plaza.receiveShadow = true;

    const leaf = new THREE.MeshStandardMaterial({ color: "#4b6b45", roughness: 0.9 });
    const trunk = new THREE.MeshStandardMaterial({ color: "#5b4636", roughness: 0.9 });
    const spots: [number, number][] = [];
    for (let x = -54; x <= 54; x += 12) spots.push([x, -32]);
    for (let z = -20; z <= 20; z += 10) spots.push([-52, z], [52, z]);
    for (const x of [-54, -44, 44, 54]) spots.push([x, 34]);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leaf, spots.length);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1, 8), trunk, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      const s = 1.7 + (Math.abs(x * 7 + z * 13) % 5) * 0.15;
      m.compose(new THREE.Vector3(x, 3.1, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.2, s));
      crowns.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 1.0, z), new THREE.Quaternion(), new THREE.Vector3(1, 2.4, 1));
      trunks.setMatrixAt(i, m);
    });
    crowns.castShadow = trunks.castShadow = true;
    crowns.computeBoundingSphere();
    trunks.computeBoundingSphere();
    return { plaza, trees: [crowns, trunks] };
  }, []);
  return (
    <group>
      <primitive object={plaza} raycast={() => null} />
      {trees.map((t, i) => (
        <primitive key={i} object={t} raycast={() => null} />
      ))}
    </group>
  );
}

export function Architecture() {
  return (
    <group>
      <Sky />
      <Skyline />
      <Grounds />
      <Floors />
      <Interior />
      <Ceiling />
    </group>
  );
}

export const BUILDING_BOUNDS = FLOOR;
