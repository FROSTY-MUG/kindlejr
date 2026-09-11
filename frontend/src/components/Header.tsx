import React from "react";
import { Zap, ShieldCheck, Wifi, WifiOff } from "lucide-react";

interface HeaderProps {
  studentName?: string;
  studentId?: string;
  isOnline?: boolean;
  pendingCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  studentName,
  studentId,
  isOnline = true,
  pendingCount = 0,
}) => {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
        {/* GEU & IEEE Official Branding Logo */}
        <div className="flex items-center space-x-3">
          <img
            src="/header-logo.png"
            alt="Graphic Era | IEEE SB"
            className="h-11 sm:h-12 w-auto object-contain rounded-xl bg-white/95 p-1 border border-slate-200/80 shadow-sm"
          />
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-none">
                Graphic Era <span className="text-xs font-semibold text-slate-500 hidden sm:inline">(Deemed to be University)</span>
              </h1>
            </div>
            <p className="text-xs font-bold text-blue-600 flex items-center gap-1 mt-0.5">
              <Zap className="w-3.5 h-3.5 fill-current text-amber-500" />
              Kindle Jr 5.0 <span className="text-slate-400 font-medium">| IEEE GEU SB</span>
            </p>
          </div>
        </div>

        {/* User Info & Connection Status */}
        <div className="flex items-center space-x-4">
          {/* Network Indicator */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 border border-slate-200">
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-slate-700 hidden xs:inline">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                <span className="text-rose-600 font-semibold">Offline</span>
                {pendingCount > 0 && (
                  <span className="ml-1 bg-rose-500 text-white text-[10px] px-1.5 py-0.2 rounded-full">
                    {pendingCount} queued
                  </span>
                )}
              </>
            )}
          </div>

          {/* Student Profile snippet */}
          {studentId && (
            <div className="hidden md:flex items-center space-x-2 bg-blue-50/80 px-3 py-1.5 rounded-lg border border-blue-100 text-xs">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <div className="text-left">
                <p className="font-semibold text-slate-800 leading-tight">{studentName || "Student"}</p>
                <p className="text-[11px] text-slate-500 leading-tight">ID: {studentId}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
