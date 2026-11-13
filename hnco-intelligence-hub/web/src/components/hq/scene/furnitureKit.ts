import { CORRIDOR_HALF, FLOOR, WALL_H, floorplan, type Furniture, type Wall } from "@/lib/floorplan";
import { C, PartBatch } from "./kit";

const LEAF = ["#2f5a3c", "#3a6b47", "#2a4f37", "#46774f", "#33603f"];

/** Deterministic jitter per item so plants etc. don't all look identical. */
const jitter = (x: number, z: number, k = 1) => {
  const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

function monitor(b: PartBatch, x: number, z: number, w: number) {
  b.box("satin", C.black, x, 0.765, z - 0.02, 0.22, 0.012, 0.16); // foot
  b.box("metal", C.darkFrame, x, 0.92, z - 0.05, 0.035, 0.3, 0.025); // arm
  b.box("satin", "#0e1014", x, 1.06, z, w, 0.35, 0.03); // bezel (screen face added by Screens)
}

function deskTopItems(b: PartBatch, f: Furniture, w: number, d: number) {
  b.box("satin", "#23272e", 0, 0.765, d / 2 - 0.2, 0.44, 0.016, 0.14); // keyboard
  b.rbox("satin", "#23272e", 0.33, 0.77, d / 2 - 0.2, 0.06, 0.025, 0.1); // mouse
  const r = jitter(f.x, f.z);
  if (r > 0.45) b.cyl("gloss", C.white, -w / 2 + 0.22, 0.81, d / 2 - 0.22, 0.08, 0.1); // cup
  if (r < 0.7) b.box("matte", "#f4f2ec", w / 2 - 0.3, 0.762, d / 2 - 0.3, 0.21, 0.01, 0.3, 0.15 * r); // papers
  if (r > 0.3 && r < 0.8) {
    b.box("satin", C.navy, -w / 2 + 0.3, 0.775, -d / 2 + 0.2, 0.22, 0.03, 0.3); // notebook
  }
}

export function buildFurniture(b: PartBatch, f: Furniture) {
  b.at(f.x, f.z, f.yaw);
  const w = f.w ?? 1;
  const d = f.d ?? 1;
  switch (f.type) {
    case "desk":
    case "workstation": {
      b.box("satin", C.oak, 0, 0.74, 0, w, 0.035, d); // top
      for (const sx of [-1, 1]) b.box("metal", C.black, sx * (w / 2 - 0.05), 0.36, 0, 0.04, 0.72, d - 0.08); // sled legs
      b.box("satin", C.navy, 0, 0.5, -d / 2 + 0.06, w - 0.14, 0.34, 0.02); // modesty panel
      b.box("gold", C.gold, 0, 0.67, -d / 2 + 0.05, w - 0.14, 0.012, 0.022); // gold accent line
      const n = f.monitors ?? 1;
      const mw = 0.56;
      for (let i = 0; i < n; i++) monitor(b, (i - (n - 1) / 2) * (mw + 0.06), -(d / 2 - 0.2), mw);
      deskTopItems(b, f, w, d);
      break;
    }
    case "execDesk": {
      b.box("gloss", C.walnut, 0, 0.75, 0, w, 0.06, d);
      b.box("gold", C.gold, 0, 0.75, d / 2 + 0.005, w, 0.03, 0.012);
      for (const sx of [-1, 1]) b.box("satin", C.navy, sx * (w / 2 - 0.06), 0.36, 0, 0.1, 0.72, d - 0.05);
      b.box("satin", C.navy, 0, 0.45, -d / 2 + 0.06, w - 0.2, 0.5, 0.03);
      b.box("satin", C.leather, 0, 0.785, d / 2 - 0.32, 0.9, 0.006, 0.45); // desk pad
      b.cyl("gold", C.gold, 0.55, 0.79, d / 2 - 0.3, 0.012, 0.15);
      for (let i = 0; i < 3; i++) monitor(b, (i - 1) * 0.68, -(d / 2 - 0.25), 0.62);
      b.box("satin", "#23272e", 0, 0.79, d / 2 - 0.22, 0.44, 0.016, 0.14);
      break;
    }
    case "chair": {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add("box", "metal", C.black, Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15, 0.04, 0.03, 0.3, 0, a, 0);
      }
      b.cyl("metal", C.black, 0, 0.24, 0, 0.05, 0.36);
      b.rbox("matte", C.charcoal, 0, 0.45, 0.02, 0.5, 0.08, 0.48);
      b.rbox("matte", C.charcoal, 0, 0.82, -0.25, 0.46, 0.56, 0.06);
      b.box("metal", C.black, 0, 0.6, -0.24, 0.05, 0.25, 0.03);
      for (const sx of [-1, 1]) b.box("satin", C.black, sx * 0.26, 0.64, 0.0, 0.04, 0.03, 0.26);
      break;
    }
    case "execChair": {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add("box", "metal", C.aluminium, Math.sin(a) * 0.17, 0.05, Math.cos(a) * 0.17, 0.045, 0.035, 0.34, 0, a, 0);
      }
      b.cyl("metal", C.aluminium, 0, 0.25, 0, 0.06, 0.38);
      b.rbox("satin", C.leather, 0, 0.47, 0.02, 0.56, 0.11, 0.52);
      b.rbox("satin", C.leather, 0, 0.95, -0.27, 0.52, 0.8, 0.1);
      for (const sx of [-1, 1]) b.rbox("satin", C.leather, sx * 0.3, 0.66, -0.02, 0.06, 0.05, 0.36);
      break;
    }
    case "highTable": {
      b.cyl("gloss", C.stone, 0, 1.04, 0, 0.9, 0.04);
      b.cyl("metal", C.black, 0, 0.52, 0, 0.06, 1.0);
      b.cyl("metal", C.black, 0, 0.015, 0, 0.5, 0.03);
      break;
    }
    case "sofa": {
      const col = C.fabricSlate;
      b.rbox("matte", col, 0, 0.22, 0.02, w, 0.26, d - 0.04);
      const seats = Math.max(1, Math.round(w / 0.8));
      const cw = (w - 0.34) / seats;
      for (let i = 0; i < seats; i++) b.rbox("matte", col, -w / 2 + 0.17 + cw * (i + 0.5), 0.4, 0.07, cw - 0.02, 0.14, d - 0.3);
      b.rbox("matte", col, 0, 0.62, -d / 2 + 0.11, w, 0.46, 0.2);
      for (const sx of [-1, 1]) b.rbox("matte", col, sx * (w / 2 - 0.08), 0.37, 0.02, 0.16, 0.5, d - 0.04);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl("gold", C.gold, sx * (w / 2 - 0.1), 0.04, sz * (d / 2 - 0.1), 0.035, 0.08);
      break;
    }
    case "armchair": {
      const col = C.fabricPlatinum;
      b.rbox("matte", col, 0, 0.24, 0.02, w, 0.26, d - 0.06);
      b.rbox("matte", col, 0, 0.41, 0.08, w - 0.26, 0.12, d - 0.32);
      b.rbox("matte", col, 0, 0.62, -d / 2 + 0.1, w, 0.46, 0.18);
      for (const sx of [-1, 1]) b.rbox("matte", col, sx * (w / 2 - 0.07), 0.39, 0.02, 0.14, 0.42, d - 0.06);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl("gold", C.gold, sx * (w / 2 - 0.09), 0.05, sz * (d / 2 - 0.1), 0.03, 0.1);
      break;
    }
    case "coffeeTable": {
      b.box("gloss", C.stone, 0, 0.42, 0, w, 0.04, d);
      b.box("satin", C.navy, 0, 0.2, 0, w - 0.25, 0.4, d - 0.25);
      b.box("matte", "#e9e2d2", -w / 4, 0.455, 0, 0.24, 0.03, 0.32, 0.3); // coffee-table book
      b.cyl("gloss", C.gold, w / 4, 0.5, 0, 0.12, 0.14);
      break;
    }
    case "plant": {
      const r = jitter(f.x, f.z, 2);
      const potCol = r > 0.5 ? "#e6e1d8" : "#2b2f36";
      const pd = w * 0.72;
      b.cyl("satin", potCol, 0, 0.3, 0, pd, 0.6);
      b.cyl("matte", "#3b2e24", 0, 0.6, 0, pd * 0.9, 0.02);
      b.cyl("matte", "#5a4636", 0, 0.9, 0, 0.04, 0.6);
      const leaves = 5;
      for (let i = 0; i < leaves; i++) {
        const a = (i / leaves) * Math.PI * 2 + r * 3;
        const rr = 0.12 + jitter(f.x, f.z, i + 3) * 0.12;
        const s = 0.42 + jitter(f.x, f.z, i + 9) * 0.22;
        b.add("icosa", "matte", LEAF[(i + Math.floor(r * 5)) % LEAF.length], Math.cos(a) * rr, 1.05 + (i % 3) * 0.17, Math.sin(a) * rr, s, s * 0.9, s, 0, a, 0);
      }
      b.add("icosa", "matte", LEAF[1], 0, 1.5, 0, 0.42, 0.42, 0.42);
      break;
    }
    case "planter": {
      b.box("satin", C.navy, 0, 0.25, 0, w, 0.5, d);
      b.box("gold", C.gold, 0, 0.5, 0, w + 0.01, 0.012, d + 0.01);
      for (let i = 0; i < 3; i++) {
        const s = 0.4 + jitter(f.x, f.z, i) * 0.15;
        b.add("icosa", "matte", LEAF[i], (i - 1) * 0.42, 0.66, 0, s, s * 0.7, s * 0.8);
      }
      break;
    }
    case "credenza": {
      b.box("gloss", "#f3f1ec", 0, 0.4, 0, w, 0.66, d);
      b.box("metal", C.black, 0, 0.035, 0, w - 0.1, 0.07, d - 0.08);
      for (let i = -1; i <= 1; i++) b.box("gold", C.gold, i * (w / 3), 0.55, d / 2 + 0.008, 0.2, 0.015, 0.012);
      // books and a vase
      const cols = [C.navy, "#a99067", C.slate, "#e2ddd2", C.navy];
      cols.forEach((c, i) => b.box("matte", c, -w / 2 + 0.25 + i * 0.06, 0.86, 0, 0.05, 0.26 + (i % 2) * 0.04, 0.2));
      b.cyl("gloss", C.white, w / 2 - 0.3, 0.88, 0, 0.14, 0.3);
      break;
    }
    case "displayTotem": {
      b.box("metal", C.black, 0, 0.02, 0, 1.3, 0.04, 0.5);
      for (const sx of [-1, 1]) b.box("metal", C.black, sx * 0.72, 1.05, -0.02, 0.06, 2.1, 0.06);
      b.box("satin", "#0c0e12", 0, 1.55, 0, 2.2, 1.28, 0.05);
      b.box("gold", C.gold, 0, 0.86, 0.03, 2.2, 0.02, 0.02);
      break;
    }
    case "mediaWall": {
      const sw = w - 0.3;
      const sh = sw * 0.5;
      b.box("satin", C.navy, 0, 1.9, 0, w, sh + 0.55, d);
      b.box("satin", "#090b10", 0, 1.9, d / 2, sw + 0.06, sh + 0.06, 0.02);
      b.box("gold", C.gold, 0, 1.9 - sh / 2 - 0.16, d / 2 + 0.01, sw, 0.018, 0.012);
      break;
    }
    case "boardTable": {
      b.box("gloss", C.stone, 0, 0.74, 0, w, 0.06, d);
      b.box("gold", C.gold, 0, 0.772, 0, 0.05, 0.004, d - 0.4);
      for (const sz of [-1, 1]) b.box("satin", C.navy, 0, 0.36, sz * (d / 4), 0.6, 0.72, 1.4);
      // closed laptops and water glasses at a few places
      for (const [lx, lz] of [
        [-0.5, -2.2],
        [0.5, -0.7],
        [-0.5, 0.8],
        [0.5, 2.2],
      ] as const) {
        b.box("metal", "#b8bec6", lx, 0.78, lz, 0.32, 0.016, 0.22);
        b.cyl("glass", "#dfe9f2", lx * 0.6, 0.83, lz + 0.25, 0.07, 0.12);
      }
      break;
    }
    case "receptionDesk": {
      b.box("satin", C.navy, 0, 0.55, d / 2 - 0.08, w, 1.1, 0.14);
      b.box("gold", C.gold, 0, 0.92, d / 2 + 0.002, w, 0.025, 0.012);
      b.box("gold", C.gold, 0, 0.12, d / 2 + 0.002, w, 0.012, 0.012);
      b.box("gloss", C.stone, 0, 1.12, d / 2 - 0.18, w + 0.12, 0.05, 0.42);
      b.box("satin", C.oak, 0, 0.75, -0.08, w - 0.1, 0.04, d - 0.3);
      for (const sx of [-1, 1]) b.box("satin", C.navy, sx * (w / 2 - 0.04), 0.55, 0, 0.08, 1.1, d);
      monitor(b, -0.6, 0.05, 0.5);
      b.cyl("gloss", C.white, 1.4, 1.27, d / 2 - 0.18, 0.12, 0.26); // vase
      for (let i = 0; i < 3; i++) b.add("icosa", "matte", ["#f4efe6", "#e9dcc0", "#f7f4ee"][i], 1.4 + (i - 1) * 0.08, 1.48 + (i % 2) * 0.05, d / 2 - 0.18, 0.16, 0.14, 0.16);
      break;
    }
    case "logoWall": {
      b.box("satin", C.navy, 0, WALL_H / 2, 0, w, WALL_H, d);
      b.box("gold", C.gold, 0, 0.6, d / 2 + 0.005, w * 0.42, 0.012, 0.01);
      b.box("emissive", "#f6e7c4", 0, WALL_H - 0.04, d / 2 + 0.04, w - 0.4, 0.03, 0.04); // wall-washer strip
      break;
    }
    case "counter": {
      b.box("satin", C.walnut, 0, 0.5, 0, w, 1.0, d);
      b.box("gloss", C.stone, 0, 1.025, 0, w + 0.1, 0.05, d + 0.06);
      b.box("gold", C.gold, 0, 0.05, d / 2 + 0.005, w, 0.04, 0.012);
      b.box("metal", "#c9cdd2", -1.2, 1.28, -0.12, 0.62, 0.46, 0.44); // coffee machine
      b.box("satin", C.black, -1.2, 1.2, 0.11, 0.4, 0.06, 0.02);
      for (let i = 0; i < 4; i++) b.cyl("gloss", C.white, 0.4 + i * 0.16, 1.1, 0.15, 0.08, 0.09);
      b.box("satin", C.oak, 0, 1.75, -0.75, w, 0.04, 0.3); // shelf
      for (let i = 0; i < 8; i++) b.cyl("gloss", i % 2 ? "#e8e2d6" : C.navy, -2.2 + i * 0.6, 1.85, -0.75, 0.12, 0.16);
      break;
    }
    case "rug": {
      b.box("flat", "#b9ad92", 0, 0.004, 0, w, 0.008, d);
      b.box("flat", "#ddd8cc", 0, 0.009, 0, w - 0.25, 0.008, d - 0.25);
      break;
    }
    case "kanbanBoard": {
      for (const sx of [-1, 1]) b.box("metal", C.aluminium, sx * (w / 2 - 0.05), 0.95, 0, 0.04, 1.9, 0.04);
      b.box("gloss", C.white, 0, 1.4, 0.02, w, 1.15, 0.03);
      b.box("metal", C.aluminium, 0, 1.4, 0.02, w + 0.03, 1.18, 0.02);
      const cols = 4;
      const noteCols = ["#f3e3b5", "#d9e4f2", "#e9d6c3", "#dfe9dc", "#c4a66a"];
      for (let c = 0; c < cols; c++) {
        const cx = -w / 2 + 0.2 + c * ((w - 0.3) / cols) + 0.15;
        b.box("satin", C.navy, cx, 1.9, 0.04, 0.42, 0.06, 0.006);
        const n = 4 - c + (c === 1 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const jx = (jitter(f.x, f.z, c * 10 + i) - 0.5) * 0.06;
          b.box("matte", noteCols[(c + i) % noteCols.length], cx + (i % 2 ? 0.12 : -0.1) + jx, 1.72 - Math.floor(i / 2) * 0.17 - (i % 2) * 0.03, 0.04, 0.13, 0.13, 0.006);
        }
      }
      break;
    }
    case "bench":
      b.box("satin", C.oak, 0, 0.44, 0, w, 0.06, d);
      for (const sx of [-1, 1]) b.box("metal", C.black, sx * (w / 2 - 0.15), 0.21, 0, 0.06, 0.42, d - 0.1);
      break;
  }
}

// --- Architecture ------------------------------------------------------------------------------

function wallParts(b: PartBatch, w: Wall) {
  const [ax, az] = w.a;
  const [bx, bz] = w.b;
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(bx - ax, bz - az) - Math.PI / 2; // local x runs along the wall
  b.at((ax + bx) / 2, (az + bz) / 2, yaw);
  const H = WALL_H;
  const frame = w.kind === "window" ? "#3a3f47" : "#b4b9c0";
  b.box("glass", "#cfdbe6", 0, H / 2, 0, len, H, w.kind === "window" ? 0.03 : 0.02);
  b.box("metal", frame, 0, 0.025, 0, len, 0.05, 0.06); // floor channel
  b.box("metal", frame, 0, H - 0.025, 0, len, 0.05, 0.06); // head channel
  const spacing = w.kind === "window" ? 3.0 : 4.0;
  const n = Math.max(1, Math.round(len / spacing));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (i * len) / n;
    b.box("metal", frame, x, H / 2, 0, w.kind === "window" ? 0.05 : 0.03, H, w.kind === "window" ? 0.1 : 0.05);
  }
  if (w.kind === "glass") {
    // Frosted manifestation band with a champagne-gold pinstripe.
    b.box("frost", "#ffffff", 0, 1.25, 0, len - 0.02, 0.32, 0.024);
    b.box("gold", C.gold, 0, 1.08, 0.013, len - 0.02, 0.008, 0.004);
  }
}

export function buildArchitecture(b: PartBatch) {
  for (const w of floorplan.walls) wallParts(b, w);

  // Perimeter structural columns.
  b.at(0, 0, 0);
  for (let x = FLOOR.minX; x <= FLOOR.maxX + 0.01; x += 6) {
    for (const z of [FLOOR.minZ - 0.25, FLOOR.maxZ + 0.25]) {
      if (z > 0 && x > -32 && x < -28) continue; // keep the entrance clear
      b.box("satin", "#e9e7e2", x, WALL_H / 2, z, 0.45, WALL_H, 0.45);
    }
  }
  for (let z = FLOOR.minZ; z <= FLOOR.maxZ + 0.01; z += 6) {
    for (const x of [FLOOR.minX - 0.25, FLOOR.maxX + 0.25]) b.box("satin", "#e9e7e2", x, WALL_H / 2, z, 0.45, WALL_H, 0.45);
  }

  // Building slab edge and roof fascia line (visible from the exterior).
  b.box("satin", "#d9d6cf", 0, -0.12, 0, FLOOR.maxX - FLOOR.minX + 1.4, 0.24, FLOOR.maxZ - FLOOR.minZ + 1.4);
  // Entrance: sliding glass doors, canopy and threshold.
  b.at(-30, 18, 0);
  b.box("glass", "#cfdbe6", -1.0, 1.25, 0.06, 1.5, 2.5, 0.03);
  b.box("glass", "#cfdbe6", 1.35, 1.25, -0.06, 1.5, 2.5, 0.03);
  b.box("metal", C.darkFrame, 0, 2.55, 0, 3.4, 0.1, 0.14);
  b.box("glass", "#cfdbe6", 0, 2.98, 0, 3.2, 0.8, 0.03);
  b.box("satin", C.navy, 0, 3.5, 1.4, 6.0, 0.14, 3.0); // canopy
  b.box("gold", C.gold, 0, 3.43, 2.9, 6.0, 0.03, 0.02);
  b.box("gloss", "#2a2f37", 0, -0.01, 1.6, 4, 0.02, 3.0); // entrance mat/threshold

  // Boulevard benches.
  for (const x of [-12, 4, 20]) {
    b.at(x, 0, 0);
    b.box("satin", C.oak, 0, 0.44, 0, 1.8, 0.06, 0.45);
    for (const sx of [-1, 1]) b.box("metal", C.black, sx * 0.75, 0.21, 0, 0.06, 0.42, 0.35);
  }
  void CORRIDOR_HALF;
}

/** Ceiling, light strips and downlights — only shown in first/third-person views. */
export function buildCeiling(b: PartBatch) {
  b.at(0, 0, 0);
  b.box("matte", "#f3f2ef", 0, WALL_H + 0.03, 0, FLOOR.maxX - FLOOR.minX, 0.06, FLOOR.maxZ - FLOOR.minZ);
  // Linear lights over every bay and along the boulevard.
  for (const cx of [-20, -12, -4, 4, 12, 20]) {
    for (const side of [-1, 1]) {
      for (const lx of [-1.6, 1.6]) b.box("emissive", "#fff7ea", cx + lx, WALL_H - 0.01, side * 10.5, 0.08, 0.02, 9);
    }
  }
  b.box("emissive", "#fff7ea", 0, WALL_H - 0.01, 0, 46, 0.02, 0.1);
  for (const [x, z] of [
    [-30, -10],
    [-30, 0],
    [-30, 8],
    [30, -10],
    [30, -5],
    [30, 6],
    [30, 10],
    [30, 14],
  ]) {
    b.cyl("emissive", "#fff3dc", x, WALL_H - 0.01, z, 0.5, 0.02);
  }
}
