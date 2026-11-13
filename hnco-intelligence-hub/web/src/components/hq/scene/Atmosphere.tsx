"use client";

import { Environment, Lightformer } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useHub } from "@/lib/store";
import { SUN_DIR } from "./Architecture";

/** Late-afternoon daylight: warm sun through the façade, soft sky fill, image-based reflections. */
export function Lighting() {
  const quality = useHub((s) => s.effectiveQuality);
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight("#fff0da", 2.6);
    l.position.copy(SUN_DIR).multiplyScalar(90);
    l.castShadow = true;
    const cam = l.shadow.camera;
    cam.left = -50;
    cam.right = 50;
    cam.top = 40;
    cam.bottom = -40;
    cam.near = 10;
    cam.far = 220;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.03;
    return l;
  }, []);

  useEffect(() => {
    const size = quality === "high" ? 4096 : quality === "balanced" ? 2048 : 1024;
    sun.castShadow = quality !== "low";
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }, [quality, sun]);

  return (
    <>
      <primitive object={sun} />
      <primitive object={sun.target} />
      <hemisphereLight args={["#e4ecf7", "#8a7660", 0.75]} />
      <Environment resolution={256} frames={1} environmentIntensity={0.85}>
        {/* Ceiling light lines and window light for reflections in glass, gold and lacquer */}
        <Lightformer form="rect" intensity={1.6} color="#fff6e8" position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[40, 8, 1]} />
        <Lightformer form="rect" intensity={2.2} color="#ffe2b8" position={[-30, 4, 20]} rotation-y={Math.PI / 4} scale={[30, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#cfe0ff" position={[30, 5, -25]} rotation-y={-Math.PI / 3} scale={[30, 6, 1]} />
        <Lightformer form="ring" intensity={1.4} color="#ffffff" position={[0, 8, 30]} scale={6} />
        <Lightformer form="rect" intensity={0.5} color="#a8b8d0" position={[0, -4, 0]} rotation-x={-Math.PI / 2} scale={[60, 60, 1]} />
      </Environment>
    </>
  );
}

/** Post stack per quality tier. Without the composer the renderer tone-maps directly. */
export function Effects() {
  const quality = useHub((s) => s.effectiveQuality);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = THREE.NeutralToneMapping;
    gl.toneMappingExposure = 1.0;
  }, [gl, quality]);

  if (quality === "low") return null;
  return (
    <EffectComposer multisampling={quality === "high" ? 4 : 0} enableNormalPass={false}>
      {quality === "high" ? (
        <N8AO aoRadius={0.9} distanceFalloff={0.6} intensity={2.2} quality="medium" halfRes color="#1a1f2a" />
      ) : (
        <></>
      )}
      <Bloom intensity={0.45} luminanceThreshold={0.9} luminanceSmoothing={0.2} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <Vignette offset={0.32} darkness={0.42} />
      {quality === "balanced" ? <SMAA /> : <></>}
    </EffectComposer>
  );
}
