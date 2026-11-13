import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * Instanced "part" batching. Furniture and architecture are built from a handful of unit
 * primitives; every placed part becomes one instance, grouped by (geometry, material class).
 * The whole office renders in ~30 draw calls instead of thousands.
 */

export type GeoKey = "box" | "rbox" | "cyl" | "sphere" | "icosa" | "cone";
export type MatKey = "matte" | "satin" | "gloss" | "metal" | "gold" | "flat" | "emissive" | "glass" | "frost";

export const unitGeometries: Record<GeoKey, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1),
  rbox: new RoundedBoxGeometry(1, 1, 1, 2, 0.12),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 18),
  sphere: new THREE.SphereGeometry(0.5, 16, 12),
  icosa: new THREE.IcosahedronGeometry(0.5, 1),
  cone: new THREE.CylinderGeometry(0.32, 0.5, 1, 18),
};

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ color: "#ffffff", ...p });

export const materials: Record<MatKey, THREE.Material> = {
  matte: std({ roughness: 0.88, metalness: 0 }),
  satin: std({ roughness: 0.5, metalness: 0.02 }),
  gloss: std({ roughness: 0.16, metalness: 0.02 }),
  metal: std({ roughness: 0.32, metalness: 0.9 }),
  gold: std({ roughness: 0.26, metalness: 1 }),
  flat: std({ roughness: 0.95, metalness: 0 }),
  emissive: new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }),
  glass: new THREE.MeshStandardMaterial({
    color: "#cfdbe6",
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    envMapIntensity: 1.6,
  }),
  frost: new THREE.MeshStandardMaterial({
    color: "#f4f6f8",
    roughness: 0.6,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  }),
};

/** Material classes that should not cast shadows. */
export const NO_CAST: MatKey[] = ["flat", "emissive", "glass", "frost"];

export const C = {
  navy: "#101827",
  navyDeep: "#0b1220",
  slate: "#52647d",
  gold: "#c4a66a",
  platinum: "#f0f2f4",
  white: "#ffffff",
  oak: "#c4a984",
  walnut: "#5b3e2c",
  stone: "#efede8",
  black: "#15181d",
  charcoal: "#2b313b",
  aluminium: "#8e969f",
  darkFrame: "#2a2f37",
  fabricSlate: "#56677e",
  fabricPlatinum: "#d8d6d0",
  leather: "#1b1d22",
} as const;

type Instance = { matrix: THREE.Matrix4; color: THREE.Color };

export class PartBatch {
  groups = new Map<string, Instance[]>();
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private origin = new THREE.Matrix4();

  /** Set the parent transform for subsequent parts (an item's position and yaw). */
  at(x: number, z: number, yaw = 0, y = 0) {
    this.origin.makeRotationY(yaw).setPosition(x, y, z);
    return this;
  }

  /**
   * Add a part in item-local space: centre (x, y, z), size (sx, sy, sz), optional local rotation.
   */
  add(
    geo: GeoKey,
    mat: MatKey,
    color: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.m.compose(this.p, this.q, this.s).premultiply(this.origin);
    const key = `${geo}|${mat}`;
    let list = this.groups.get(key);
    if (!list) this.groups.set(key, (list = []));
    list.push({ matrix: this.m.clone(), color: new THREE.Color(color) });
    return this;
  }

  box(mat: MatKey, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
    return this.add("box", mat, color, x, y, z, sx, sy, sz, 0, ry, 0);
  }
  rbox(mat: MatKey, color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
    return this.add("rbox", mat, color, x, y, z, sx, sy, sz, 0, ry, 0);
  }
  cyl(mat: MatKey, color: string, x: number, y: number, z: number, d: number, h: number) {
    return this.add("cyl", mat, color, x, y, z, d, h, d);
  }

  /** Build one InstancedMesh per group. */
  build(): THREE.InstancedMesh[] {
    const meshes: THREE.InstancedMesh[] = [];
    for (const [key, list] of this.groups) {
      const [geo, mat] = key.split("|") as [GeoKey, MatKey];
      const mesh = new THREE.InstancedMesh(unitGeometries[geo], materials[mat], list.length);
      list.forEach((inst, i) => {
        mesh.setMatrixAt(i, inst.matrix);
        mesh.setColorAt(i, inst.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = !NO_CAST.includes(mat);
      mesh.receiveShadow = mat !== "emissive" && mat !== "glass";
      mesh.name = key;
      mesh.computeBoundingSphere();
      if (mat === "glass" || mat === "frost") mesh.renderOrder = 2;
      meshes.push(mesh);
    }
    return meshes;
  }
}
