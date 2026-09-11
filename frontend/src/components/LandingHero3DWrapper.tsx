"use client";

import dynamic from "next/dynamic";
import React from "react";

const GoldenGlitterCanvas = dynamic(
  () => import("./GoldenGlitterCanvas").then((mod) => mod.GoldenGlitterCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 pointer-events-none -z-10 bg-slate-950 flex items-center justify-center text-amber-400 font-mono text-xs overflow-hidden">
        <img
          src="/geu-logo.png"
          alt=""
          className="absolute w-[80vw] max-w-[900px] h-auto select-none pointer-events-none"
          style={{
            filter: "blur(50px) brightness(0.6) saturate(0.3)",
            WebkitFilter: "blur(50px) brightness(0.6) saturate(0.3)",
            opacity: 0.5,
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
