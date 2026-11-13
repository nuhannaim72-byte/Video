"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Geometric "HN.CO" logotype built from extruded shapes (no font files needed).
 * Letter units: cap height 1.
 */
function letterShapes(): { shapes: THREE.Shape[]; width: number; dot: THREE.Shape } {
  const shapes: THREE.Shape[] = [];
  let x = 0;
  const S = 0.16; // stroke
  const gap = 0.15;
  const poly = (pts: [number, number][], ox: number) => {
    const s = new THREE.Shape();
    pts.forEach(([px, py], i) => (i === 0 ? s.moveTo(px + ox, py) : s.lineTo(px + ox, py)));
    s.closePath();
    return s;
  };
  // H
  shapes.push(poly([[0, 0], [S, 0], [S, 0.42], [0.62, 0.42], [0.62, 0], [0.78, 0], [0.78, 1], [0.62, 1], [0.62, 0.58], [S, 0.58], [S, 1], [0, 1]], x));
  x += 0.78 + gap;
  // N
  shapes.push(poly([[0, 0], [S, 0], [S, 0.72], [0.62, 0], [0.8, 0], [0.8, 1], [0.64, 1], [0.64, 0.28], [0.18, 1], [0, 1]], x));
  x += 0.8 + gap * 0.8;
  // .
  const dot = new THREE.Shape();
  dot.absarc(x + 0.09, 0.09, 0.09, 0, Math.PI * 2, false);
  x += 0.18 + gap * 0.8;
  // C (ring with an opening to the right)
  const R = 0.5;
  const r = R - S;
  const cx = x + R;
  const open = 0.72;
  const c = new THREE.Shape();
  c.absarc(cx, 0.5, R, open, Math.PI * 2 - open, false);
  c.lineTo(cx + r * Math.cos(-open), 0.5 + r * Math.sin(-open));
  c.absarc(cx, 0.5, r, Math.PI * 2 - open, open, true);
  c.closePath();
  shapes.push(c);
  x += 0.88 + gap;
  // O
  const o = new THREE.Shape();
  o.absarc(x + R, 0.5, R, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(x + R, 0.5, r, 0, Math.PI * 2, true);
  o.holes.push(hole);
  shapes.push(o);
  x += 1.0;
  return { shapes, width: x, dot };
}

export function useLogoGeometry() {
  return useMemo(() => {
    const { shapes, width, dot } = letterShapes();
    const opts: THREE.ExtrudeGeometryOptions = {
      depth: 0.09,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.012,
      bevelSegments: 2,
      curveSegments: 32,
    };
    const letters = new THREE.ExtrudeGeometry(shapes, opts);
    const dotGeo = new THREE.ExtrudeGeometry(dot, opts);
    const g = mergeGeometries([letters, dotGeo], true)!;
    g.translate(-width / 2, 0, 0);
    letters.dispose();
    dotGeo.dispose();
    return g;
  }, []);
}

const goldMaterial = () =>
  new THREE.MeshStandardMaterial({ color: "#c9ab6e", metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
const platinumMaterial = () =>
  new THREE.MeshStandardMaterial({ color: "#f0f2f4", metalness: 0.85, roughness: 0.25, envMapIntensity: 1.2 });

/** Tagline / caption rendered to a small texture. */
function useTextTexture(lines: { text: string; font: string; color: string; y: number; spacing?: number }[], w = 1024, h = 160) {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d")!;
    c.textAlign = "center";
    for (const l of lines) {
      c.font = l.font;
      c.fillStyle = l.color;
      if ("letterSpacing" in c && l.spacing) (c as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${l.spacing}px`;
      c.fillText(l.text, w / 2, l.y);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function LogoWall() {
  const geo = useLogoGeometry();
  const mats = useMemo(() => [platinumMaterial(), goldMaterial()], []);
  const tagline = useTextTexture([
    { text: "INTELLIGENCE BEHIND EVERY TRANSFORMATION.", font: "500 34px 'Helvetica Neue', Helvetica, Arial, sans-serif", color: "#d9dde3", y: 64, spacing: 9 },
    { text: "HN.CO INTELLIGENCE HUB", font: "500 22px 'Helvetica Neue', Helvetica, Arial, sans-serif", color: "#c4a66a", y: 124, spacing: 12 },
  ]);
  useEffect(() => () => {
    geo.dispose();
    mats.forEach((m) => m.dispose());
    tagline.dispose();
  }, [geo, mats, tagline]);
  return (
    <group>
      {/* Reception feature wall (front face at z ≈ -17.02) */}
      <mesh geometry={geo} material={mats} position={[-30, 1.85, -17.0]} scale={0.95} castShadow raycast={() => null} />
      <mesh position={[-30, 1.25, -17.015]} raycast={() => null}>
        <planeGeometry args={[6.4, 1.0]} />
        <meshBasicMaterial map={tagline} transparent toneMapped={false} />
      </mesh>
      {/* Exterior sign on the entrance canopy */}
      <mesh geometry={geo} material={mats} position={[-30, 3.6, 20.92]} scale={0.38} raycast={() => null} />
      <WallWash from={[-33.2, 3.25, -13.5]} to={[-30, 1.9, -17]} />
      <WallWash from={[-26.8, 3.25, -13.5]} to={[-30, 1.9, -17]} />
    </group>
  );
}

/** Warm spotlight washing the logo wall; target object is part of the scene so it aims correctly. */
function WallWash({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const light = useMemo(() => {
    const l = new THREE.SpotLight("#ffe9c4", 38, 11, 0.62, 0.85, 2);
    l.position.set(...from);
    l.target.position.set(...to);
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
}
