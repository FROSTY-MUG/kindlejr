"use client";

import dynamic from "next/dynamic";
import React from "react";

const GoldenGlitterCanvas = dynamic(
  () => import("./GoldenGlitterCanvas").then((mod) => mod.GoldenGlitterCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 pointer-events-none -z-10 bg-slate-950 flex items-center justify-center text-amber-400 font-mono text-xs overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center scale-110 opacity-70"
          style={{
            backgroundImage: "url('/geu-building.jpg')",
            filter: "blur(45px) brightness(0.7)",
            WebkitFilter: "blur(45px) brightness(0.7)",
          }}
        />
        <div className="absolute inset-0 bg-slate-950/70" />
        <span className="relative z-10 animate-pulse">Kindly wait a moment.</span>
      </div>
    ),
  }
);

export function LandingHero3DWrapper() {
  return <GoldenGlitterCanvas />;
}

export default LandingHero3DWrapper;
