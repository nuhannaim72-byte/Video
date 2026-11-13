"use client";

import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { labelAnchors, labelElements } from "./labels";

const v = new THREE.Vector3();
const camPos = new THREE.Vector3();

export function LabelProjector() {
  const size = useThree((s) => s.size);
  useFrame(({ camera }) => {
    camera.getWorldPosition(camPos);
    const ortho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
    for (const [id, el] of labelElements) {
      const a = labelAnchors.get(id);
      if (!a) continue;
      v.copy(a).project(camera);
      const visible = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      if (!visible) {
        el.style.opacity = "0";
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      const dist = ortho ? 30 / Math.max(0.2, (camera as THREE.OrthographicCamera).zoom / 14) : camPos.distanceTo(a);
      const scale = THREE.MathUtils.clamp(16 / Math.max(dist, 1), 0.55, 1.15);
      el.style.opacity = dist > 95 ? "0" : "1";
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      el.style.zIndex = String(1000 - Math.round(dist));
    }
  });
  return null;
}
