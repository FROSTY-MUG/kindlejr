"use client";

import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

function MetallicCore() {
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.4;
      meshRef.current.rotation.y += delta * 0.6;
    }
  });

  return (
    <Float speed={2} rotationIntensity={1.5} floatIntensity={2}>
      <mesh ref={meshRef} scale={1.8}>
        <icosahedronGeometry args={[1, 1]} />
        <MeshDistortMaterial
          color="#1e3a8a"
          roughness={0.2}
          metalness={0.9}
          distort={0.3}
          speed={3}
          wireframe={true}
        />
      </mesh>
    </Float>
  );
}

function ParticleField() {
  const pointsRef = useRef<THREE.Points>(null!);
  const count = 300;

  const positions = React.useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      pos[i] = (Math.random() - 0.5) * 15;
    }
    return pos;
  }, [count]);

  useFrame((state, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y -= delta * 0.05;
    }
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
      <pointsMaterial size={0.04} color="#60a5fa" transparent opacity={0.6} />
    </points>
  );
}

export const LandingHero3D: React.FC = () => {
  return (
    <div className="relative w-full h-64 sm:h-80 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 mb-8">
      {/* 3D Canvas Layer */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
          <ambientLight intensity={0.7} />
          <directionalLight position={[10, 10, 5]} intensity={1.5} color="#60a5fa" />
          <pointLight position={[-10, -10, -10]} color="#3b82f6" intensity={1} />
          <MetallicCore />
          <ParticleField />
          <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={1} />
        </Canvas>
      </div>

      {/* Overlay Banner Text */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent flex flex-col justify-end p-6 text-white pointer-events-none">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 font-black text-xs flex items-center justify-center shadow-lg ring-2 ring-blue-400/30">
            GEU
          </div>
          <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest">
            IEEE GEU Student Branch
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-md">
          Kindle Jr 5.0 Hackathon Assessment
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 max-w-md mt-1">
          Graphic Era (Deemed to be University) • First-Year B.Tech & BCA Challenge
        </p>
      </div>
    </div>
  );
};
