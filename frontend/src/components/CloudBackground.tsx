import React from "react";

export const CloudBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Subtle Gradient Backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-slate-50 to-blue-50/30" />

      {/* Cloud Motif SVG 1 - Top Left */}
      <div className="absolute -top-12 -left-12 opacity-40 cloud-anim-1 text-slate-200">
        <svg width="420" height="240" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
        </svg>
      </div>

      {/* Cloud Motif SVG 2 - Right Mid */}
      <div className="absolute top-1/3 -right-20 opacity-30 cloud-anim-2 text-blue-100">
        <svg width="550" height="300" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
        </svg>
      </div>

      {/* Cloud Motif SVG 3 - Bottom Left */}
      <div className="absolute -bottom-16 left-1/4 opacity-25 cloud-anim-1 text-indigo-100">
        <svg width="480" height="260" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
        </svg>
      </div>

      {/* Tech Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f015_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f015_1px,transparent_1px)] bg-[size:4rem_4rem]" />
    </div>
  );
};
