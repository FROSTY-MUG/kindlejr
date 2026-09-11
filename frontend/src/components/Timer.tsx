import React, { useEffect, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface TimerProps {
  initialSeconds: number;
  onExpire: () => void;
}

export const Timer: React.FC<TimerProps> = ({ initialSeconds, onExpire }) => {
  const [secondsLeft, setSecondsLeft] = useState<number>(initialSeconds);

  useEffect(() => {
    setSecondsLeft(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpire();
      return;
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsLeft, onExpire]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  const isUrgent = secondsLeft < 120; // under 2 minutes
  const isWarning = secondsLeft < 600; // under 10 minutes

  return (
    <div
      className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl border text-sm font-mono tracking-tight font-bold transition-all ${
        isUrgent
          ? "bg-rose-500/20 border-rose-500/50 text-rose-400 animate-pulse"
          : isWarning
          ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
          : "bg-slate-900 border-white/10 text-amber-400"
      }`}
    >
      {isUrgent ? (
        <AlertTriangle className="w-4 h-4 text-rose-400 animate-spin" />
      ) : (
        <Clock className="w-4 h-4 text-amber-400" />
      )}
      <span>
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
      <span className="text-[10px] font-sans font-medium text-slate-400 uppercase tracking-wider hidden xs:inline">
        Remaining
      </span>
    </div>
  );
};
