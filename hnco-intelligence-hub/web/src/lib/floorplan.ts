/**
 * HN.CO headquarters floor plan. Everything spatial lives here: zones, walls, furniture,
 * the places agents can sit or stand ("spots"), walking routes, screens and camera vantage points.
 * Units are metres. +x = east, +z = south, y = up. One floor, 72 m × 36 m.
 *
 *   x: -36 ─ -24 │ -24 ─────────────── 24 │ 24 ─ 36
 *      Reception │ north bays (6)          │ Executive office
 *                │ ─── central boulevard ─ │ foyer
 *                │ south bays (5 + café)   │ Glass boardroom
 */
import type { AgentId, DepartmentId } from "./types";

export const FLOOR = { minX: -36, maxX: 36, minZ: -18, maxZ: 18 };
export const WALL_H = 3.4;
export const CORRIDOR_HALF = 3;
export const BAY_W = 8;
export const BAY_DEPTH = 15;

export type Vec2 = [number, number];
export type ZoneId = DepartmentId | "reception" | "cafe" | "boardroom" | "foyer" | "corridor";

export type Zone = {
  id: ZoneId;
  label: string;
  rect: { x0: number; z0: number; x1: number; z1: number };
  floor: "stone" | "carpet" | "walnut" | "marble" | "carpetNavy" | "oak";
  /** Where the camera flies to when this zone is selected: [position, target]. */
  vantage: { position: [number, number, number]; target: [number, number, number] };
};

export type Wall = { a: Vec2; b: Vec2; kind: "window" | "glass" | "solid"; h?: number };

export type FurnitureType =
  | "desk"
  | "workstation"
  | "chair"
  | "execChair"
  | "highTable"
  | "sofa"
  | "armchair"
  | "coffeeTable"
  | "plant"
  | "credenza"
  | "displayTotem"
  | "mediaWall"
  | "boardTable"
  | "receptionDesk"
  | "logoWall"
  | "counter"
  | "rug"
  | "execDesk"
  | "planter"
  | "bench"
  | "kanbanBoard";

export type Furniture = {
  type: FurnitureType;
  x: number;
  z: number;
  /** Rotation about y. The item's "front" faces +z at yaw 0. */
  yaw: number;
  w?: number;
  d?: number;
  /** Screen atlas tile for items with screens. */
  tile?: number;
  monitors?: number;
  color?: string;
};

export type SpotPose = "sit" | "stand";
export type Spot = {
  key: string;
  x: number;
  z: number;
  yaw: number;
  pose: SpotPose;
  /** Waypoints from this spot's zone door to the spot (world coords), excluding the spot itself. */
  approach: Vec2[];
  /** The zone's door: a point just outside it, on the corridor side. */
  door: Vec2;
  zone: ZoneId;
  /** Point the head should look at when settled (monitor, presenter, colleague). */
  lookAt?: [number, number, number];
};

export type Obstacle = { x0: number; z0: number; x1: number; z1: number };

export type ScreenPlacement = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  w: number;
  h: number;
  tile: number;
};

export const NORTH_ROW: DepartmentId[] = ["strategy", "bizdev", "marketing", "project", "bi", "dataeng"];
export const SOUTH_ROW: (DepartmentId | "cafe")[] = ["technology", "finance", "cafe", "hr", "legal", "clientsuccess"];
const BAY_CENTERS = [-20, -12, -4, 4, 12, 20];

/** Screen atlas tile index per department (0–11) plus shared screens. */
export const TILE = {
  executive: 0,
  strategy: 1,
  bizdev: 2,
  marketing: 3,
  project: 4,
  bi: 5,
  dataeng: 6,
  technology: 7,
  finance: 8,
  hr: 9,
  legal: 10,
  clientsuccess: 11,
  boardroom: 12,
  reception: 13,
  cafe: 14,
  execMediaWall: 15,
} as const;

export const yawToward = (fromX: number, fromZ: number, toX: number, toZ: number) =>
  Math.atan2(toX - fromX, toZ - fromZ);

// ---------------------------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------------------------

const zones: Zone[] = [];
const walls: Wall[] = [];
const furniture: Furniture[] = [];
const spots: Record<string, Spot> = {};
const obstacles: Obstacle[] = [];
const screens: ScreenPlacement[] = [];

const addSpot = (s: Spot) => {
  spots[s.key] = s;
};
const addObstacle = (x: number, z: number, w: number, d: number, yaw = 0) => {
  // Axis-aligned bounds of a w×d footprint rotated by yaw (only multiples of 90° are used).
  const swap = Math.abs(Math.sin(yaw)) > 0.5;
  const hw = (swap ? d : w) / 2;
  const hd = (swap ? w : d) / 2;
  obstacles.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd });
};
const place = (f: Furniture, solid = true) => {
  furniture.push(f);
  if (solid && f.w && f.d) addObstacle(f.x, f.z, f.w, f.d, f.yaw);
};

// --- Department bay ----------------------------------------------------------------------------

/**
 * A bay is 8 m wide and 15 m deep, opening onto the central boulevard.
 * Local coords: lx ∈ [-4, 4] across, u ∈ [0, 15] from the corridor partition towards the windows.
 */
function buildBay(id: DepartmentId | "cafe", cx: number, side: 1 | -1) {
  const W = (lx: number, u: number): Vec2 => [cx + lx, side * (CORRIDOR_HALF + u)];
  const backYaw = side === 1 ? 0 : Math.PI; // facing the windows
  const frontYaw = side === 1 ? Math.PI : 0; // facing the corridor
  const door: Vec2 = [cx, side * 1.4];
  const doorIn = W(0, 1.0);
  const z0 = side * CORRIDOR_HALF;
  const z1 = side * (CORRIDOR_HALF + BAY_DEPTH);

  // Partitions: front glass with a door, side glass shared with neighbours.
  const gap = id === "cafe" ? 2.6 : 1.0;
  walls.push({ a: [cx - 4, z0], b: [cx - gap, z0], kind: "glass" });
  walls.push({ a: [cx + gap, z0], b: [cx + 4, z0], kind: "glass" });

  const [vx, vz] = W(0, -2.2);
  const [tx, tz] = W(0, 8);
  zones.push({
    id,
    label: id,
    rect: { x0: cx - 4, z0: Math.min(z0, z1), x1: cx + 4, z1: Math.max(z0, z1) },
    floor: id === "cafe" ? "oak" : "carpet",
    vantage: { position: [vx + 0.01, 7.2, vz - side * 3.2], target: [tx, 0.6, tz] },
  });

  if (id === "cafe") {
    buildCafe(cx, side, W, backYaw, frontYaw, door, doorIn);
    return;
  }
  const tile = TILE[id];

  // Primary desk (the agent's own), second desk, specialist workstation.
  const deskA = W(-1.3, 7.4);
  const deskB = W(1.3, 7.4);
  const ws = W(-1.6, 11.4);
  place({ type: "desk", x: deskA[0], z: deskA[1], yaw: frontYaw, w: 1.6, d: 0.8, monitors: 2, tile });
  place({ type: "desk", x: deskB[0], z: deskB[1], yaw: frontYaw, w: 1.6, d: 0.8, monitors: 1, tile });
  place({ type: "workstation", x: ws[0], z: ws[1], yaw: frontYaw, w: 2.0, d: 0.8, monitors: 3, tile });

  const seatA = W(-1.3, 6.45);
  const seatB = W(1.3, 6.45);
  const seatW = W(-1.6, 10.45);
  place({ type: "chair", x: seatA[0], z: seatA[1], yaw: backYaw }, false);
  place({ type: "chair", x: seatB[0], z: seatB[1], yaw: backYaw }, false);
  place({ type: "chair", x: seatW[0], z: seatW[1], yaw: backYaw }, false);

  // Department dashboard on a freestanding display, facing the corridor.
  const disp = W(2.3, 12.6);
  place({ type: "displayTotem", x: disp[0], z: disp[1], yaw: frontYaw, w: 2.3, d: 0.5, tile });
  // Project management also gets a physical Kanban board.
  if (id === "project") {
    const kb = W(3.55, 9.2);
    place({ type: "kanbanBoard", x: kb[0], z: kb[1], yaw: side === 1 ? -Math.PI / 2 : -Math.PI / 2, w: 0.2, d: 2.4 });
  } else {
    const cr = W(3.62, 8.6);
    place({ type: "credenza", x: cr[0], z: cr[1], yaw: -Math.PI / 2, w: 2.4, d: 0.45 });
  }

  // Collaboration high table near the entrance.
  const table = W(1.6, 3.2);
  place({ type: "highTable", x: table[0], z: table[1], yaw: 0, w: 0.9, d: 0.9 });

  // Greenery.
  place({ type: "plant", x: W(-3.35, 1.0)[0], z: W(-3.35, 1.0)[1], yaw: 0, w: 0.5, d: 0.5 });
  place({ type: "plant", x: W(-3.35, 14.2)[0], z: W(-3.35, 14.2)[1], yaw: 0, w: 0.5, d: 0.5 });
  place({ type: "plant", x: W(3.4, 14.4)[0], z: W(3.4, 14.4)[1], yaw: 0, w: 0.5, d: 0.5 });

  const monitorA: [number, number, number] = [deskA[0], 1.05, W(-1.3, 7.62)[1]];
  const monitorW: [number, number, number] = [ws[0], 1.05, W(-1.6, 11.62)[1]];

  addSpot({
    key: `${id}:desk`,
    x: seatA[0],
    z: seatA[1],
    yaw: backYaw,
    pose: "sit",
    approach: [doorIn, W(-1.3, 5.3)],
    door,
    zone: id,
    lookAt: monitorA,
  });
  addSpot({
    key: `${id}:desk2`,
    x: seatB[0],
    z: seatB[1],
    yaw: backYaw,
    pose: "sit",
    approach: [doorIn, W(1.3, 5.3)],
    door,
    zone: id,
    lookAt: [deskB[0], 1.05, monitorA[2]],
  });
  addSpot({
    key: `${id}:workstation`,
    x: seatW[0],
    z: seatW[1],
    yaw: backYaw,
    pose: "sit",
    approach: [doorIn, W(0, 5.3), W(0, 9.3), W(-1.6, 9.4)],
    door,
    zone: id,
    lookAt: monitorW,
  });
  // Standing next to the primary desk (a colleague visiting).
  const visitor = W(-0.15, 6.15);
  addSpot({
    key: `${id}:visitor`,
    x: visitor[0],
    z: visitor[1],
    yaw: yawToward(visitor[0], visitor[1], seatA[0], seatA[1] + side * 0.4),
    pose: "stand",
    approach: [doorIn, W(-0.15, 5.0)],
    door,
    zone: id,
    lookAt: [seatA[0], 1.15, seatA[1]],
  });
  const collabA = W(0.9, 3.2);
  const collabB = W(2.3, 3.2);
  addSpot({
    key: `${id}:collab`,
    x: collabA[0],
    z: collabA[1],
    yaw: yawToward(collabA[0], collabA[1], table[0], table[1]),
    pose: "stand",
    approach: [doorIn],
    door,
    zone: id,
    lookAt: [table[0] + 0.6, 1.5, table[1]],
  });
  addSpot({
    key: `${id}:collab2`,
    x: collabB[0],
    z: collabB[1],
    yaw: yawToward(collabB[0], collabB[1], table[0], table[1]),
    pose: "stand",
    approach: [doorIn, W(2.3, 2.0)],
    door,
    zone: id,
    lookAt: [table[0] - 0.6, 1.5, table[1]],
  });
}

function buildCafe(
  cx: number,
  side: 1 | -1,
  W: (lx: number, u: number) => Vec2,
  backYaw: number,
  frontYaw: number,
  door: Vec2,
  doorIn: Vec2,
) {
  const counter = W(0, 13.4);
  place({ type: "counter", x: counter[0], z: counter[1], yaw: frontYaw, w: 5.6, d: 0.9, tile: TILE.cafe });
  const tables: Vec2[] = [W(-1.7, 5.6), W(1.7, 8.6)];
  tables.forEach((t) => place({ type: "highTable", x: t[0], z: t[1], yaw: 0, w: 0.9, d: 0.9 }));
  place({ type: "armchair", x: W(-2.9, 10.2)[0], z: W(-2.9, 10.2)[1], yaw: Math.PI / 2, w: 0.85, d: 0.85 });
  place({ type: "armchair", x: W(-2.9, 11.6)[0], z: W(-2.9, 11.6)[1], yaw: Math.PI / 2, w: 0.85, d: 0.85 });
  place({ type: "coffeeTable", x: W(-1.8, 10.9)[0], z: W(-1.8, 10.9)[1], yaw: 0, w: 0.7, d: 0.7 });
  place({ type: "plant", x: W(3.4, 1.0)[0], z: W(3.4, 1.0)[1], yaw: 0, w: 0.5, d: 0.5 });
  place({ type: "plant", x: W(-3.4, 1.0)[0], z: W(-3.4, 1.0)[1], yaw: 0, w: 0.5, d: 0.5 });
  place({ type: "rug", x: W(-2.2, 10.9)[0], z: W(-2.2, 10.9)[1], yaw: 0, w: 2.6, d: 2.6 }, false);

  const offsets: [number, number][] = [
    [-0.75, 0],
    [0.7, 0.35],
    [0.1, -0.75],
  ];
  let n = 0;
  tables.forEach((t, ti) => {
    offsets.forEach(([ox, oz]) => {
      const x = t[0] + ox;
      const z = t[1] + oz * side;
      const approach: Vec2[] = ti === 0 ? [doorIn] : [doorIn, W(0.2, 6.5)];
      addSpot({
        key: `cafe:spot:${n}`,
        x,
        z,
        yaw: yawToward(x, z, t[0], t[1]),
        pose: "stand",
        approach,
        door,
        zone: "cafe",
        lookAt: [t[0], 1.5, t[1]],
      });
      n++;
    });
  });
  void backYaw;
}

// --- Reception ---------------------------------------------------------------------------------

function buildReception() {
  zones.push({
    id: "reception",
    label: "Reception",
    rect: { x0: -36, z0: -18, x1: -24, z1: 18 },
    floor: "marble",
    vantage: { position: [-30, 6.5, 12], target: [-30, 1.2, -10] },
  });
  // Entrance glass doors in the south facade; logo wall faces the arriving visitor.
  place({ type: "logoWall", x: -30, z: -17.2, yaw: 0, w: 9, d: 0.35 });
  place({ type: "receptionDesk", x: -30, z: -11.6, yaw: 0, w: 4.4, d: 0.9 });
  place({ type: "execChair", x: -30, z: -12.8, yaw: 0 }, false);
  place({ type: "rug", x: -30, z: 5, yaw: 0, w: 6.2, d: 4.2 }, false);
  place({ type: "sofa", x: -33.1, z: 5, yaw: Math.PI / 2, w: 2.4, d: 0.95 });
  place({ type: "sofa", x: -26.9, z: 5, yaw: -Math.PI / 2, w: 2.4, d: 0.95 });
  place({ type: "coffeeTable", x: -30, z: 5, yaw: 0, w: 1.4, d: 0.8 });
  place({ type: "armchair", x: -30, z: 2.6, yaw: 0, w: 0.85, d: 0.85 });
  place({ type: "plant", x: -35.2, z: -16.8, yaw: 0, w: 0.6, d: 0.6 });
  place({ type: "plant", x: -24.8, z: -16.8, yaw: 0, w: 0.6, d: 0.6 });
  place({ type: "plant", x: -35.2, z: 16.8, yaw: 0, w: 0.6, d: 0.6 });
  place({ type: "plant", x: -25, z: 16.6, yaw: 0, w: 0.6, d: 0.6 });
  place({ type: "displayTotem", x: -25.2, z: -5.5, yaw: -Math.PI / 2, w: 2.3, d: 0.5, tile: TILE.reception });

  addSpot({
    key: "reception:concierge",
    x: -30,
    z: -12.75,
    yaw: 0,
    pose: "stand",
    approach: [[-24.5, 0], [-33, -9.5], [-33, -12.9]],
    door: [-23.5, 0],
    zone: "reception",
    lookAt: [-30, 1.5, 0],
  });

  // West wing wall onto the boulevard (opening at the corridor).
  walls.push({ a: [-24, -18], b: [-24, -CORRIDOR_HALF], kind: "glass" });
  walls.push({ a: [-24, CORRIDOR_HALF], b: [-24, 18], kind: "glass" });
}

// --- Executive suite ---------------------------------------------------------------------------

export const BOARDROOM_SEATS = 9;

function buildExecutive() {
  zones.push({
    id: "executive",
    label: "Executive Office",
    rect: { x0: 24, z0: -18, x1: 36, z1: -2 },
    floor: "walnut",
    vantage: { position: [27, 7.5, 1.5], target: [31, 0.8, -10] },
  });
  zones.push({
    id: "foyer",
    label: "Executive foyer",
    rect: { x0: 24, z0: -2, x1: 36, z1: 2 },
    floor: "stone",
    vantage: { position: [22, 6, 0], target: [31, 1, 0] },
  });
  zones.push({
    id: "boardroom",
    label: "Glass Boardroom",
    rect: { x0: 24, z0: 2, x1: 36, z1: 18 },
    floor: "carpetNavy",
    vantage: { position: [27, 7.5, -1.5], target: [31, 0.8, 10] },
  });

  walls.push({ a: [24, -18], b: [24, -2], kind: "glass" });
  walls.push({ a: [24, 2], b: [24, 18], kind: "glass" });
  walls.push({ a: [24, -2], b: [25.4, -2], kind: "glass" });
  walls.push({ a: [27.4, -2], b: [36, -2], kind: "glass" });
  walls.push({ a: [24, 2], b: [25.4, 2], kind: "glass" });
  walls.push({ a: [27.4, 2], b: [36, 2], kind: "glass" });

  const foyerDoor: Vec2 = [23.2, 0];

  // Managing Director's office.
  place({ type: "rug", x: 31.2, z: -10.5, yaw: 0, w: 5.2, d: 4.4 }, false);
  place({ type: "execDesk", x: 31.6, z: -11, yaw: Math.PI / 2, w: 2.6, d: 1.15, monitors: 3, tile: TILE.executive });
  place({ type: "execChair", x: 32.75, z: -11, yaw: -Math.PI / 2 }, false);
  place({ type: "armchair", x: 29.9, z: -11.75, yaw: Math.PI / 2, w: 0.85, d: 0.85 });
  place({ type: "armchair", x: 29.9, z: -10.25, yaw: Math.PI / 2, w: 0.85, d: 0.85 });
  place({ type: "mediaWall", x: 30.5, z: -17.3, yaw: 0, w: 6.2, d: 0.3, tile: TILE.execMediaWall });
  place({ type: "sofa", x: 34.6, z: -5.2, yaw: -Math.PI / 2, w: 2.4, d: 0.95 });
  place({ type: "coffeeTable", x: 33.2, z: -5.2, yaw: 0, w: 0.9, d: 1.3 });
  place({ type: "plant", x: 35.3, z: -17.2, yaw: 0, w: 0.6, d: 0.6 });
  place({ type: "plant", x: 24.7, z: -17.2, yaw: 0, w: 0.6, d: 0.6 });

  // Executive AI's desk near the door, facing the performance wall.
  place({ type: "desk", x: 27.0, z: -7.3, yaw: 0, w: 1.8, d: 0.85, monitors: 2, tile: TILE.executive });
  place({ type: "chair", x: 27.0, z: -6.35, yaw: Math.PI }, false);
  addSpot({
    key: "executive:desk",
    x: 27.0,
    z: -6.35,
    yaw: Math.PI,
    pose: "sit",
    approach: [[26.4, 0], [26.4, -3.2], [27.0, -5.2]],
    door: foyerDoor,
    zone: "executive",
    lookAt: [27.0, 1.05, -7.55],
  });
  addSpot({
    key: "executive:visitor",
    x: 28.25,
    z: -5.75,
    yaw: yawToward(28.25, -5.75, 27.0, -6.6),
    pose: "stand",
    approach: [[26.4, 0], [26.4, -3.2], [28.2, -4.6]],
    door: foyerDoor,
    zone: "executive",
    lookAt: [27.0, 1.15, -6.35],
  });
  addSpot({
    key: "executive:visitor2",
    x: 28.9,
    z: -7.1,
    yaw: yawToward(28.9, -7.1, 27.0, -6.6),
    pose: "stand",
    approach: [[26.4, 0], [26.4, -3.2], [29.0, -4.8]],
    door: foyerDoor,
    zone: "executive",
    lookAt: [27.0, 1.15, -6.35],
  });
  // Reviewing the live performance wall (the MD's own chair stays free for the human).
  addSpot({
    key: "executive:workstation",
    x: 29.4,
    z: -15.4,
    yaw: Math.PI,
    pose: "stand",
    approach: [[26.4, 0], [26.4, -3.2], [25.4, -9], [27.6, -14.6]],
    door: foyerDoor,
    zone: "executive",
    lookAt: [30.5, 1.9, -17.3],
  });
  addSpot({
    key: "executive:collab",
    x: 33.0,
    z: -6.4,
    yaw: yawToward(33.0, -6.4, 33.2, -5.2),
    pose: "stand",
    approach: [[26.4, 0], [26.4, -3.2], [31.5, -6.6]],
    door: foyerDoor,
    zone: "executive",
    lookAt: [30.5, 1.9, -17.3],
  });

  // Boardroom: long table, 8 side seats + head seat, presenter beside the screen.
  place({ type: "boardTable", x: 30.5, z: 10.5, yaw: 0, w: 1.7, d: 6.0 });
  place({ type: "mediaWall", x: 30.5, z: 2.45, yaw: 0, w: 3.6, d: 0.25, tile: TILE.boardroom });
  place({ type: "plant", x: 35.3, z: 17.2, yaw: 0, w: 0.6, d: 0.6 });
  place({ type: "plant", x: 24.7, z: 17.2, yaw: 0, w: 0.6, d: 0.6 });
  place({ type: "credenza", x: 35.55, z: 10.5, yaw: -Math.PI / 2, w: 3.0, d: 0.45 });

  const presenter: [number, number] = [32.75, 3.6];
  const seatZ = [8.25, 9.75, 11.25, 12.75];
  const roomApproach: Vec2[] = [[26.4, 0], [26.4, 3.4]];
  let i = 0;
  for (const z of seatZ) {
    for (const x of [28.95, 32.05]) {
      const yaw = x < 30.5 ? Math.PI / 2 : -Math.PI / 2;
      const aisle = x < 30.5 ? 28.1 : 33.0;
      place({ type: "chair", x, z, yaw }, false);
      addSpot({
        key: `boardroom:seat:${i}`,
        x,
        z,
        yaw,
        pose: "sit",
        approach: [...roomApproach, [aisle, 5.2], [aisle, z]],
        door: foyerDoor,
        zone: "boardroom",
        lookAt: [presenter[0], 1.5, presenter[1]],
      });
      i++;
    }
  }
  place({ type: "chair", x: 30.5, z: 14.3, yaw: Math.PI }, false);
  addSpot({
    key: `boardroom:seat:${i}`,
    x: 30.5,
    z: 14.3,
    yaw: Math.PI,
    pose: "sit",
    approach: [...roomApproach, [28.1, 5.2], [28.1, 15.2], [30.5, 15.2]],
    door: foyerDoor,
    zone: "boardroom",
    lookAt: [presenter[0], 1.5, presenter[1]],
  });
  addSpot({
    key: "boardroom:presenter",
    x: presenter[0],
    z: presenter[1],
    yaw: yawToward(presenter[0], presenter[1], 30.5, 10.5),
    pose: "stand",
    approach: [...roomApproach, [31.5, 4.4]],
    door: foyerDoor,
    zone: "boardroom",
    lookAt: [30.5, 1.2, 10.5],
  });

  // Foyer décor.
  place({ type: "plant", x: 35.3, z: 0, yaw: 0, w: 0.7, d: 0.7 });
}

// --- Corridor & façade -------------------------------------------------------------------------

function buildShell() {
  zones.push({
    id: "corridor",
    label: "Central boulevard",
    rect: { x0: -24, z0: -CORRIDOR_HALF, x1: 24, z1: CORRIDOR_HALF },
    floor: "stone",
    vantage: { position: [-22, 4.5, 0], target: [10, 1.2, 0] },
  });
  // Floor-to-ceiling windows on all façades, entrance doors in the south façade of reception.
  walls.push({ a: [-36, -18], b: [36, -18], kind: "window" });
  walls.push({ a: [36, -18], b: [36, 18], kind: "window" });
  walls.push({ a: [-36, 18], b: [-31.6, 18], kind: "window" });
  walls.push({ a: [-28.4, 18], b: [36, 18], kind: "window" });
  walls.push({ a: [-36, -18], b: [-36, 18], kind: "window" });
  // Partitions between bays.
  for (const x of [-16, -8, 0, 8, 16]) {
    walls.push({ a: [x, -18], b: [x, -CORRIDOR_HALF], kind: "glass" });
    walls.push({ a: [x, CORRIDOR_HALF], b: [x, 18], kind: "glass" });
  }
  // Planters marking bay boundaries along the boulevard.
  for (const x of [-16, -8, 0, 8, 16]) {
    place({ type: "planter", x, z: -2.35, yaw: 0, w: 1.4, d: 0.5 });
    place({ type: "planter", x, z: 2.35, yaw: 0, w: 1.4, d: 0.5 });
  }
}

buildShell();
NORTH_ROW.forEach((id, i) => buildBay(id, BAY_CENTERS[i], -1));
SOUTH_ROW.forEach((id, i) => buildBay(id, BAY_CENTERS[i], 1));
buildReception();
buildExecutive();

// Screen placements (monitor faces, wall displays) derived from furniture.
for (const f of furniture) {
  if (f.tile === undefined) continue;
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  const at = (lx: number, y: number, lz: number, w: number, h: number) =>
    screens.push({ x: f.x + lx * c + lz * s, y, z: f.z - lx * s + lz * c, yaw: f.yaw, w, h, tile: f.tile! });
  if (f.type === "desk" || f.type === "workstation" || f.type === "execDesk") {
    const n = f.monitors ?? 1;
    const mw = f.type === "execDesk" ? 0.62 : 0.56;
    const spacing = mw + 0.06;
    const depthOff = (f.d ?? 0.8) / 2 - 0.2;
    for (let i = 0; i < n; i++) {
      const lx = (i - (n - 1) / 2) * spacing;
      // Monitors sit towards the back edge of the desk, screens facing the seated person (+z local).
      at(lx, 1.06, -depthOff + 0.026, mw - 0.03, 0.31);
    }
  } else if (f.type === "displayTotem") {
    at(0, 1.55, 0.06, 2.1, 1.18);
  } else if (f.type === "mediaWall") {
    const w = (f.w ?? 3) - 0.3;
    at(0, 1.9, (f.d ?? 0.3) / 2 + 0.012, w, w * 0.5);
  } else if (f.type === "counter") {
    at(0, 2.35, -0.5, 1.8, 0.9);
  }
}

export const floorplan = { zones, walls, furniture, spots, obstacles, screens };

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export const zoneById = Object.fromEntries(zones.map((z) => [z.id, z])) as Record<ZoneId, Zone>;

export function zoneAt(x: number, z: number): Zone | undefined {
  // Prefer specific zones over the corridor.
  return (
    zones.find((zn) => zn.id !== "corridor" && x >= zn.rect.x0 && x <= zn.rect.x1 && z >= zn.rect.z0 && z <= zn.rect.z1) ??
    zones.find((zn) => x >= zn.rect.x0 && x <= zn.rect.x1 && z >= zn.rect.z0 && z <= zn.rect.z1)
  );
}

export const BREAK_SPOTS = Object.keys(spots).filter((k) => k.startsWith("cafe:spot:"));

/** Lane offsets keep people walking in opposite directions from walking through each other. */
const laneZ = (dirX: number) => (dirX >= 0 ? -0.55 : 0.55);

/**
 * Route between two spots: back out along the origin spot's approach, through the door,
 * along the boulevard and in through the destination door.
 */
export type RoutePoint = { x: number; z: number; door?: boolean };

export function routeBetween(from: { x: number; z: number; spot?: Spot }, to: Spot): RoutePoint[] {
  const pts: RoutePoint[] = [];
  const add = (p: Vec2, door = false) => pts.push({ x: p[0], z: p[1], door });
  const fromSpot = from.spot;
  if (fromSpot && fromSpot.zone === to.zone) {
    // Same room: retrace to the first approach waypoint shared with the destination, then in.
    [...fromSpot.approach].reverse().slice(0, Math.max(0, fromSpot.approach.length - 1)).forEach((p) => add(p));
    to.approach.slice(1).forEach((p) => add(p));
    add([to.x, to.z]);
    return pts;
  }
  if (fromSpot) [...fromSpot.approach].reverse().forEach((p) => add(p));
  const startDoor = fromSpot?.door ?? nearestCorridorPoint(from.x, from.z);
  const sameDoor = Math.hypot(startDoor[0] - to.door[0], startDoor[1] - to.door[1]) < 0.1;
  if (!sameDoor) {
    add(startDoor, true);
    if (Math.abs(to.door[0] - startDoor[0]) > 0.5) {
      const lz = laneZ(Math.sign(to.door[0] - startDoor[0]) || 1);
      add([startDoor[0], lz], true);
      add([to.door[0], lz], true);
    }
    add(to.door, true);
  }
  to.approach.forEach((p) => add(p));
  add([to.x, to.z]);
  return pts;
}

function nearestCorridorPoint(x: number, z: number): Vec2 {
  return [Math.max(-23, Math.min(23, x)), Math.max(-1.5, Math.min(1.5, z))];
}

/** Desk spot for an agent's own place in the office. */
export const homeSpot = (agent: AgentId) => `${agent}:desk`;

export const deskSpotFor = (agent: AgentId, kind: "desk" | "workstation" | "visitor" | "collab" | "collab2") =>
  `${agent}:${kind}`;
