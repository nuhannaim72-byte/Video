import * as THREE from "three";

/**
 * Name tags are plain DOM elements positioned every frame from 3D anchors — far cheaper than
 * one React root per label. Agents writes anchors; LabelProjector writes element transforms.
 */
export const labelAnchors = new Map<string, THREE.Vector3>();
export const labelElements = new Map<string, HTMLElement>();

export const anchorFor = (id: string) => {
  let v = labelAnchors.get(id);
  if (!v) labelAnchors.set(id, (v = new THREE.Vector3()));
  return v;
};
