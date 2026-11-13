"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CORRIDOR_HALF, floorplan, NORTH_ROW, SOUTH_ROW } from "@/lib/floorplan";
import { ATLAS_H, ATLAS_W, COLS, paintAtlas, paintSigns, SIGN_ORDER, SIGN_TILE_H, SIGN_TILE_W, TILE_H, TILE_W } from "./screenPainter";

/** Build one merged geometry of quads, each mapped to a tile of an atlas. */
function quads(
  items: { x: number; y: number; z: number; yaw: number; w: number; h: number; u0: number; v0: number; u1: number; v1: number }[],
) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  items.forEach((q, i) => {
    const c = Math.cos(q.yaw);
    const s = Math.sin(q.yaw);
    const corners: [number, number, number, number][] = [
      [-q.w / 2, -q.h / 2, q.u0, q.v0],
      [q.w / 2, -q.h / 2, q.u1, q.v0],
      [q.w / 2, q.h / 2, q.u1, q.v1],
      [-q.w / 2, q.h / 2, q.u0, q.v1],
    ];
    for (const [lx, ly, u, vv] of corners) {
      v.set(q.x + lx * c, q.y + ly, q.z - lx * s);
      pos.push(v.x, v.y, v.z);
      uv.push(u, vv);
    }
    const b = i * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const INSET = 4; // px, keeps mip-map bleed from neighbouring tiles out of view

export function Screens() {
  const { texture, canvas } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = ATLAS_W;
    canvas.height = ATLAS_H;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.flipY = true;
    return { texture, canvas };
  }, []);

  const geometry = useMemo(
    () =>
      quads(
        floorplan.screens.map((s) => {
          const tx = (s.tile % COLS) * TILE_W;
          const ty = Math.floor(s.tile / COLS) * TILE_H;
          return {
            ...s,
            u0: (tx + INSET) / ATLAS_W,
            u1: (tx + TILE_W - INSET) / ATLAS_W,
            v0: 1 - (ty + TILE_H - INSET) / ATLAS_H,
            v1: 1 - (ty + INSET) / ATLAS_H,
          };
        }),
      ),
    [],
  );

  const ctx = useMemo(() => canvas.getContext("2d")!, [canvas]);
  const last = useRef(-10);
  const clock = useRef(0);
  useFrame((_, dt) => {
    clock.current += dt;
    if (clock.current - last.current < 2.5) return;
    last.current = clock.current;
    paintAtlas(ctx, clock.current);
    texture.needsUpdate = true;
  });

  useEffect(() => () => {
    texture.dispose();
    geometry.dispose();
  }, [texture, geometry]);

  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial map={texture} toneMapped={false} color="#e6e9ee" />
    </mesh>
  );
}

/** Department name plates above each bay entrance, executive suite plates. */
export function Signage() {
  const { texture, geometry } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = SIGN_TILE_W * 2;
    canvas.height = SIGN_TILE_H * 8;
    paintSigns(canvas.getContext("2d")!);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const W = canvas.width;
    const H = canvas.height;
    const uvFor = (key: string) => {
      const i = SIGN_ORDER.indexOf(key);
      const tx = (i % 2) * SIGN_TILE_W;
      const ty = Math.floor(i / 2) * SIGN_TILE_H;
      return { u0: tx / W, u1: (tx + SIGN_TILE_W) / W, v0: 1 - (ty + SIGN_TILE_H) / H, v1: 1 - ty / H };
    };
    const centers = [-20, -12, -4, 4, 12, 20];
    const items = [
      ...NORTH_ROW.map((id, i) => ({ x: centers[i], y: 2.75, z: -CORRIDOR_HALF + 0.03, yaw: 0, w: 2.2, h: 0.55, ...uvFor(id) })),
      ...SOUTH_ROW.map((id, i) => ({ x: centers[i], y: 2.75, z: CORRIDOR_HALF - 0.03, yaw: Math.PI, w: 2.2, h: 0.55, ...uvFor(id) })),
      { x: 31.2, y: 2.75, z: -1.97, yaw: 0, w: 2.2, h: 0.55, ...uvFor("executive") },
      { x: 31.2, y: 2.75, z: 1.97, yaw: Math.PI, w: 2.2, h: 0.55, ...uvFor("boardroom") },
    ];
    return { texture, geometry: quads(items) };
  }, []);
  useEffect(() => () => {
    texture.dispose();
    geometry.dispose();
  }, [texture, geometry]);
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshStandardMaterial map={texture} roughness={0.45} metalness={0.1} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.25} />
    </mesh>
  );
}
