import * as THREE from "three";
import type { Appearance } from "@/lib/catalog";

/**
 * Procedural articulated figure. Joints are plain Object3Ds (never rendered); every frame their
 * world matrices are copied into instanced body-part meshes shared by all figures.
 * Conventions: the figure faces +z; its left is +x. Negative rotation.x swings a limb forward.
 */

export type PartKey =
  | "hips"
  | "torso"
  | "thigh"
  | "shin"
  | "shoe"
  | "upperArm"
  | "forearm"
  | "hand"
  | "cuff"
  | "neck"
  | "head"
  | "nose"
  | "ear"
  | "hairCap"
  | "hairLong"
  | "hairBun"
  | "hairCurly"
  | "shirt"
  | "tie"
  | "pin"
  | "cup";

export type PartSpec = {
  geo: "capsuleLimb" | "capsuleArm" | "capsuleTorso" | "sphere" | "rbox" | "cyl" | "icosa";
  mat: "skin" | "cloth" | "hair" | "shoe" | "shirt" | "gold" | "ceramic";
  /** Instances per figure (left/right pairs = 2). */
  perFigure: number;
};

export const PARTS: Record<PartKey, PartSpec> = {
  hips: { geo: "rbox", mat: "cloth", perFigure: 1 },
  torso: { geo: "capsuleTorso", mat: "cloth", perFigure: 1 },
  thigh: { geo: "capsuleLimb", mat: "cloth", perFigure: 2 },
  shin: { geo: "capsuleLimb", mat: "cloth", perFigure: 2 },
  shoe: { geo: "rbox", mat: "shoe", perFigure: 2 },
  upperArm: { geo: "capsuleArm", mat: "cloth", perFigure: 2 },
  forearm: { geo: "capsuleArm", mat: "cloth", perFigure: 2 },
  hand: { geo: "sphere", mat: "skin", perFigure: 2 },
  cuff: { geo: "cyl", mat: "shirt", perFigure: 2 },
  neck: { geo: "cyl", mat: "skin", perFigure: 1 },
  head: { geo: "sphere", mat: "skin", perFigure: 1 },
  nose: { geo: "rbox", mat: "skin", perFigure: 1 },
  ear: { geo: "sphere", mat: "skin", perFigure: 2 },
  hairCap: { geo: "sphere", mat: "hair", perFigure: 1 },
  hairLong: { geo: "rbox", mat: "hair", perFigure: 1 },
  hairBun: { geo: "sphere", mat: "hair", perFigure: 1 },
  hairCurly: { geo: "icosa", mat: "hair", perFigure: 1 },
  shirt: { geo: "rbox", mat: "shirt", perFigure: 1 },
  tie: { geo: "rbox", mat: "cloth", perFigure: 1 },
  pin: { geo: "sphere", mat: "gold", perFigure: 1 },
  cup: { geo: "cyl", mat: "ceramic", perFigure: 1 },
};

// Segment lengths in figure units (≈ metres for a 1.75 m person).
export const L = {
  pelvisY: 0.95,
  hipX: 0.095,
  thigh: 0.44,
  shin: 0.43,
  spineY: 0.06,
  shoulderY: 0.42,
  shoulderX: 0.19,
  upperArm: 0.29,
  forearm: 0.26,
  neckY: 0.5,
};

type Slot = { key: PartKey; node: THREE.Object3D; color: THREE.Color; visible: boolean };

const mkColor = (c: string) => new THREE.Color(c);

export class FigureRig {
  root = new THREE.Object3D();
  pelvis = new THREE.Object3D();
  spine = new THREE.Object3D();
  neck = new THREE.Object3D();
  shoulder = [new THREE.Object3D(), new THREE.Object3D()]; // 0 = left (+x), 1 = right
  elbow = [new THREE.Object3D(), new THREE.Object3D()];
  wrist = [new THREE.Object3D(), new THREE.Object3D()];
  hip = [new THREE.Object3D(), new THREE.Object3D()];
  knee = [new THREE.Object3D(), new THREE.Object3D()];
  ankle = [new THREE.Object3D(), new THREE.Object3D()];
  head = new THREE.Object3D();
  slots: Slot[] = [];
  cupSlot!: Slot;

  constructor(public look: Appearance) {
    const r = this.root;
    r.add(this.pelvis);
    this.pelvis.position.y = L.pelvisY;
    this.pelvis.add(this.spine);
    this.spine.position.y = L.spineY;
    this.spine.add(this.neck);
    this.neck.position.y = L.neckY;

    const skin = mkColor(look.skin);
    const suit = mkColor(look.suit);
    const trousers = mkColor(look.trousers);
    const shirt = mkColor(look.shirt);
    const hair = mkColor(look.hair);
    const shoe = mkColor("#17181b");
    const build = look.build;

    const part = (key: PartKey, parent: THREE.Object3D, color: THREE.Color, pos: [number, number, number], scale: [number, number, number], rot?: [number, number, number], visible = true) => {
      const n = new THREE.Object3D();
      n.position.set(...pos);
      n.scale.set(...scale);
      if (rot) n.rotation.set(...rot);
      parent.add(n);
      const slot = { key, node: n, color, visible };
      this.slots.push(slot);
      return slot;
    };

    // Pelvis & legs
    part("hips", this.pelvis, trousers, [0, -0.02, 0], [0.33 * build, 0.2, 0.22]);
    for (let s = 0; s < 2; s++) {
      const sx = s === 0 ? 1 : -1;
      const hip = this.hip[s];
      hip.position.set(sx * L.hipX, -0.04, 0);
      this.pelvis.add(hip);
      part("thigh", hip, trousers, [0, -L.thigh / 2, 0], [1.05 * build, 1, 1.05]);
      const knee = this.knee[s];
      knee.position.y = -L.thigh;
      hip.add(knee);
      part("shin", knee, trousers, [0, -L.shin / 2, 0], [0.88, 1, 0.88]);
      const ankle = this.ankle[s];
      ankle.position.y = -L.shin;
      knee.add(ankle);
      part("shoe", ankle, shoe, [0, -0.045, 0.055], [0.1, 0.075, 0.27]);
    }

    // Torso
    part("torso", this.spine, suit, [0, 0.23, 0], [1.12 * build, 1, 0.66]);
    part("shirt", this.spine, shirt, [0, 0.4, 0.088], [0.1, 0.15, 0.03], [-0.25, 0, 0]);
    part("tie", this.spine, look.tie ? mkColor(look.tie) : suit, [0, 0.31, 0.1], [0.04, 0.22, 0.018], [-0.12, 0, 0], !!look.tie);
    part("pin", this.spine, mkColor("#c4a66a"), [0.085, 0.4, 0.09], [0.022, 0.022, 0.01]);

    // Arms
    for (let s = 0; s < 2; s++) {
      const sx = s === 0 ? 1 : -1;
      const sh = this.shoulder[s];
      sh.position.set(sx * L.shoulderX * build, L.shoulderY, 0);
      this.spine.add(sh);
      part("upperArm", sh, suit, [0, -L.upperArm / 2, 0], [1, 1, 1]);
      const el = this.elbow[s];
      el.position.y = -L.upperArm;
      sh.add(el);
      part("forearm", el, suit, [0, -L.forearm / 2, 0], [1, 1, 1]);
      const wr = this.wrist[s];
      wr.position.y = -L.forearm;
      el.add(wr);
      part("cuff", wr, shirt, [0, 0.005, 0], [0.085, 0.03, 0.085]);
      part("hand", wr, skin, [0, -0.075, 0.01], [0.075, 0.16, 0.05]);
      if (s === 1) this.cupSlot = part("cup", wr, mkColor("#f6f4ef"), [0, -0.1, 0.06], [0.075, 0.1, 0.075], undefined, false);
    }

    // Neck & head
    part("neck", this.neck, skin, [0, 0.04, 0], [0.095, 0.11, 0.095]);
    this.neck.add(this.head);
    this.head.position.y = 0.17;
    part("head", this.head, skin, [0, 0, 0], [0.19, 0.235, 0.215]);
    part("nose", this.head, skin, [0, -0.01, 0.105], [0.03, 0.05, 0.04], [0.2, 0, 0]);
    part("ear", this.head, skin, [0.097, 0, -0.005], [0.03, 0.06, 0.045]);
    part("ear", this.head, skin, [-0.097, 0, -0.005], [0.03, 0.06, 0.045]);
    const style = look.hairStyle;
    part("hairCap", this.head, hair, [0, 0.045, -0.014], [0.205, 0.19, 0.228], undefined, style !== "bald" && style !== "curly");
    part("hairLong", this.head, hair, [0, -0.06, -0.075], [0.2, 0.3, 0.09], undefined, style === "long");
    part("hairBun", this.head, hair, [0, 0.07, -0.13], [0.11, 0.1, 0.1], undefined, style === "bun");
    part("hairCurly", this.head, hair, [0, 0.05, -0.012], [0.235, 0.205, 0.245], undefined, style === "curly");
  }
}

// --- Poses -------------------------------------------------------------------------------------

export type Pose = {
  pelvisY: number;
  spinePitch: number;
  spineYaw: number;
  neckPitch: number;
  neckYaw: number;
  hip: [number, number];
  hipRoll: [number, number];
  knee: [number, number];
  shPitch: [number, number];
  shRoll: [number, number];
  elbow: [number, number];
  cup: number;
};

export const newPose = (): Pose => ({
  pelvisY: L.pelvisY,
  spinePitch: 0,
  spineYaw: 0,
  neckPitch: 0,
  neckYaw: 0,
  hip: [0, 0],
  hipRoll: [0, 0],
  knee: [0, 0],
  shPitch: [0, 0],
  shRoll: [0.07, -0.07],
  elbow: [-0.12, -0.12],
  cup: 0,
});

export const copyPose = (dst: Pose, src: Pose) => {
  dst.pelvisY = src.pelvisY;
  dst.spinePitch = src.spinePitch;
  dst.spineYaw = src.spineYaw;
  dst.neckPitch = src.neckPitch;
  dst.neckYaw = src.neckYaw;
  for (let i = 0; i < 2; i++) {
    dst.hip[i] = src.hip[i];
    dst.hipRoll[i] = src.hipRoll[i];
    dst.knee[i] = src.knee[i];
    dst.shPitch[i] = src.shPitch[i];
    dst.shRoll[i] = src.shRoll[i];
    dst.elbow[i] = src.elbow[i];
  }
  dst.cup = src.cup;
};

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

export function dampPose(cur: Pose, target: Pose, k: number, dt: number) {
  cur.pelvisY = damp(cur.pelvisY, target.pelvisY, k, dt);
  cur.spinePitch = damp(cur.spinePitch, target.spinePitch, k, dt);
  cur.spineYaw = damp(cur.spineYaw, target.spineYaw, k, dt);
  cur.neckPitch = damp(cur.neckPitch, target.neckPitch, k * 0.7, dt);
  cur.neckYaw = damp(cur.neckYaw, target.neckYaw, k * 0.7, dt);
  for (let i = 0; i < 2; i++) {
    cur.hip[i] = damp(cur.hip[i], target.hip[i], k, dt);
    cur.hipRoll[i] = damp(cur.hipRoll[i], target.hipRoll[i], k, dt);
    cur.knee[i] = damp(cur.knee[i], target.knee[i], k, dt);
    cur.shPitch[i] = damp(cur.shPitch[i], target.shPitch[i], k, dt);
    cur.shRoll[i] = damp(cur.shRoll[i], target.shRoll[i], k, dt);
    cur.elbow[i] = damp(cur.elbow[i], target.elbow[i], k, dt);
  }
  cur.cup = target.cup;
}

export function applyPose(rig: FigureRig, p: Pose) {
  rig.pelvis.position.y = p.pelvisY;
  rig.spine.rotation.set(p.spinePitch, p.spineYaw, 0);
  rig.neck.rotation.set(p.neckPitch, p.neckYaw, 0, "YXZ");
  for (let i = 0; i < 2; i++) {
    rig.hip[i].rotation.set(p.hip[i], 0, p.hipRoll[i]);
    rig.knee[i].rotation.x = p.knee[i];
    rig.ankle[i].rotation.x = -(p.hip[i] + p.knee[i]) * 0.35; // keep feet roughly level
    rig.shoulder[i].rotation.set(p.shPitch[i], 0, p.shRoll[i]);
    rig.elbow[i].rotation.x = p.elbow[i];
  }
  rig.cupSlot.visible = p.cup > 0.5;
}

// --- Two-bone arm IK (sagittal plane of the spine) ---------------------------------------------

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Solve shoulder pitch/roll and elbow bend so the hand reaches `targetRootLocal`
 * (a point in the figure's root space). Writes into the pose.
 */
export function solveArmIK(rig: FigureRig, pose: Pose, side: 0 | 1, targetRootLocal: THREE.Vector3) {
  // Express the target in the spine frame (uses the current spine matrices).
  rig.root.updateMatrixWorld(true);
  _v.copy(targetRootLocal).applyMatrix4(rig.root.matrixWorld);
  _m.copy(rig.spine.matrixWorld).invert();
  _v.applyMatrix4(_m);
  const sh = rig.shoulder[side].position;
  const tx = _v.x - sh.x;
  const ty = _v.y - sh.y;
  const tz = _v.z - sh.z;
  const L1 = L.upperArm;
  const L2 = L.forearm + 0.07; // to the palm
  const planar = Math.hypot(ty, tz);
  const d = Math.min(Math.max(planar, 0.08), L1 + L2 - 0.002);
  const cosE = (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2);
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosE)));
  const alpha = Math.atan2(tz, -ty); // forward angle of the target from straight down
  const cosB = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d);
  const beta = Math.acos(Math.min(1, Math.max(-1, cosB)));
  pose.shPitch[side] = -(alpha - beta);
  pose.elbow[side] = -bend;
  // Small roll to reach sideways offsets.
  const roll = Math.atan2(tx, Math.max(0.15, planar));
  pose.shRoll[side] = Math.max(-0.9, Math.min(0.9, roll));
}
