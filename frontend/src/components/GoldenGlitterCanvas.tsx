"use client";

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function GoldenGlitterParticles() {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 600;

  // Initialize particle positions and random speed attributes
  const [positions, speeds] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const spd = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;     // X
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20; // Y
      pos[i * 3 + 2] = (Math.random() - 0.5) * 15; // Z
      spd[i] = 0.02 + Math.random() * 0.04;        // Upward speed
    }

    return [pos, spd];
  }, [count]);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    const positionAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const array = positionAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      // Move particles upwards along the Y-axis
      array[i * 3 + 1] += speeds[i];

      // Reset to bottom when rising past top threshold
      if (array[i * 3 + 1] > 10) {
        array[i * 3 + 1] = -10;
        array[i * 3] = (Math.random() - 0.5) * 20;
      }
    }

    positionAttr.needsUpdate = true;
    pointsRef.current.rotation.y += delta * 0.03;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        color="#FBBF24"
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

export function GoldenGlitterCanvas() {
  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden bg-slate-950">
      {/* GEU Logo Background with 50% Blur */}
      <div className="absolute inset-0 flex items-center justify-center transform-gpu">
        <img
          src="/geu-logo.png"
          alt=""
          className="w-[80vw] max-w-[900px] h-auto select-none pointer-events-none"
          style={{
            filter: "blur(50px) brightness(0.6) saturate(0.3)",
            WebkitFilter: "blur(50px) brightness(0.6) saturate(0.3)",
            opacity: 0.5,
          }}
        />
      </div>

      {/* Sleek Dark Vignette Gradient for UI readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/40 to-slate-950/80" />

      {/* Interactive 3D Golden Glitter Particles */}
      <Canvas camera={{ position: [0, 0, 7], fov: 60 }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#FBBF24" />
        <GoldenGlitterParticles />
      </Canvas>
    </div>
  );
}

export default GoldenGlitterCanvas;
