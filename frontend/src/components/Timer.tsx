import React, { useEffect, useRef, useState } from "react";
import { Clock, AlertTriangle } from "lucide-react";

interface TimerProps {
  initialSeconds: number;
  onExpire: () => void;
}

// Timer is deadline-anchored rather than tick-counted.
//
// The previous implementation decremented a counter inside setInterval and had
// secondsLeft in its effect dependency list, so the interval was torn down and
// rebuilt every second. Browsers throttle (or fully suspend) timers in hidden
// and background tabs, so the count would silently fall behind wall-clock time
// and hand the student extra minutes. Deriving the display from a fixed deadline
// keeps it truthful no matter how the tab is scheduled.
export const Timer: React.FC<TimerProps> = ({ initialSeconds, onExpire }) => {
  const deadlineRef = useRef<number>(Date.now() + initialSeconds * 1000);
  const firedRef = useRef<boolean>(false);
  const onExpireRef = useRef(onExpire);

  const computeSecondsLeft = () =>
    Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));

  const [secondsLeft, setSecondsLeft] = useState<number>(computeSecondsLeft);

  // Re-arm whenever the server supplies a fresh duration (e.g. state recovery).
  useEffect(() => {
    deadlineRef.current = Date.now() + initialSeconds * 1000;
    firedRef.current = false;
    setSecondsLeft(computeSecondsLeft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeconds]);

  // Keep the latest callback without restarting the interval.
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const tick = () => {
      const left = computeSecondsLeft();
      setSecondsLeft(left);

      // Fire exactly once, and only when the deadline is genuinely reached.
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpireRef.current();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);

    // A tab that was suspended resumes with an immediate correction instead of
    // waiting up to a second to notice the deadline has passed.
    const handleVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
