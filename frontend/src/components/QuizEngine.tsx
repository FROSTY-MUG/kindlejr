import React, { useState, useEffect, useRef, useCallback } from "react";
import { QuestionCard } from "./QuestionCard";
import { Timer } from "./Timer";
import {
  apiAutoSaveAnswer,
  apiSubmitQuiz,
  EXAM_DURATION_SECONDS,
  TOTAL_QUESTIONS,
  Question,
  StudentData,
} from "../services/api";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { ArrowLeft, ArrowRight, CheckCircle, Send, Loader2, AlertTriangle, ShieldAlert, Volume2, X } from "lucide-react";

export interface SubmissionResult {
  totalScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  strikesCount?: number;
  cheated?: boolean;
}

interface QuizEngineProps {
  student: StudentData;
  questions: Question[];
  shuffledOrder: number[];
  initialCurrentIndex?: number;
  initialAnswers?: Record<string, string>;
  initialRemainingSeconds?: number;
  onSubmitted: (result: SubmissionResult) => void;
}

const ASCII_SECURITY_BANNER = `
================================================================================
 ____   ___    _   _  ___ _____   _____ ______   __  _____ ___     ____ _   _ _____    _  _____ 
|  _ \\ / _ \\  | \\ | |/ _ \\_   _| |_   _|  _ \\ \\ / / |_   _/ _ \\   / ___| | | | ____|  / \\|_   _|
| | | | | | | |  \\| | | | || |     | | | |_) \\ V /    | || | | | | |   | |_| |  _|   / _ \\ | |  
| |_| | |_| | | |\\  | |_| || |     | | |  _ < | |     | || |_| | | |___|  _  | |___ / ___ \\| |  
|____/ \\___/  |_| \\_|\\___/ |_|     |_| |_| \\_\\|_|     |_| \\___/   \\____|_| |_|_____/_/   \\_\\_|  
                                                                                               
 __   _____  _   _      _    ____  _____    ____    _   _  ____ _   _ _____                     
 \\ \\ / / _ \\| | | |    / \\  |  _ \\| ____|  / ___|  / \\ | | | | | | | |_   _|                    
  \\ V / | | | | | |   / _ \\ | |_) |  _|   | |     / _ \\| | | | | | | | | |                      
   | || |_| | |_| |  / ___ \\|  _ <| |___  | |___ / ___ | |_| | |_| | | | |                      
   |_| \\___/ \\___/  /_/   \\_\\_| \\_\\_____|  \\____/_/   \\_\\____/\\___/  |_|                      
================================================================================
`;

let globalAudioCtx: AudioContext | null = null;

function getOrInitAudioContext(): AudioContext | null {
  try {
    if (!globalAudioCtx) {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        globalAudioCtx = new AudioContextClass();
      }
    }
    if (globalAudioCtx && globalAudioCtx.state === "suspended") {
      globalAudioCtx.resume().catch(() => {});
    }
    return globalAudioCtx;
  } catch {
    return null;
  }
}

// Synthesizes a blaring, forced loud security alarm siren via Web Audio API at maximum gain
function playSecuritySiren() {
  try {
    const ctx = getOrInitAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    // Dual Oscillators for piercing acoustic penetration
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = "sawtooth";
    osc2.type = "square";

    osc1.frequency.setValueAtTime(850, ctx.currentTime);
    osc2.frequency.setValueAtTime(1400, ctx.currentTime);

    // Rapid alternating siren modulation (650Hz <-> 1800Hz)
    let isHigh = false;
    const interval = setInterval(() => {
      if (ctx.state === "closed") {
        clearInterval(interval);
        return;
      }
      const now = ctx.currentTime;
      const f1 = isHigh ? 650 : 1350;
      const f2 = isHigh ? 1100 : 1800;
      osc1.frequency.setValueAtTime(f1, now);
      osc2.frequency.setValueAtTime(f2, now);
      isHigh = !isHigh;
    }, 140);

    // Maximum gain (1.0 = full volume amplitude)
    gainNode.gain.setValueAtTime(1.0, ctx.currentTime);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start();
    osc2.start();

    // Sound continuously for 60 seconds
    setTimeout(() => {
      clearInterval(interval);
      try {
        osc1.stop();
        osc2.stop();
      } catch {}
    }, 60000);
  } catch (err) {
    console.warn("Audio Siren failed:", err);
  }
}

export const QuizEngine: React.FC<QuizEngineProps> = ({
  student,
  questions,
  shuffledOrder,
  initialCurrentIndex = 0,
  initialAnswers = {},
  initialRemainingSeconds = EXAM_DURATION_SECONDS,
  onSubmitted,
}) => {
  const totalQuestions = shuffledOrder.length || TOTAL_QUESTIONS;
  const [currentIndex, setCurrentIndex] = useState<number>(initialCurrentIndex);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(initialRemainingSeconds);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>("");

  // Anti-Cheating state (2-Strike Rule: 1 warning -> 2nd strike terminates + plays loud siren)
  const [violationCount, setViolationCount] = useState<number>(0);
  const [showWarningToast, setShowWarningToast] = useState<boolean>(false);
  const [showDevToolsModal, setShowDevToolsModal] = useState<boolean>(false);
  const [isSplitScreenActive, setIsSplitScreenActive] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(true);
  const [blockedActionNotice, setBlockedActionNotice] = useState<string>("");

  const { isOnline, queueOfflineAnswer } = useOfflineSync(student.studentId);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerStartedRef = useRef<boolean>(false);

  // Map position in shuffled order array to ground truth question
  const currentOriginalIndex = shuffledOrder[currentIndex] ?? 0;
  const currentQuestion = questions[currentOriginalIndex];

  // Disable console and developer inspection tools
  useEffect(() => {
    try {
      const noop = () => {};
      console.log = noop;
      console.warn = noop;
      console.error = noop;
      console.info = noop;
      console.table = noop;
      console.clear();
    } catch {}
  }, []);

  // Start timer backend trigger on initial render of Question 1 if not started yet
  useEffect(() => {
    if (!timerStartedRef.current && isOnline) {
      timerStartedRef.current = true;
      apiAutoSaveAnswer({
        studentId: student.studentId,
        currentQuestion: currentIndex,
        startTimerNow: true,
      }).catch(() => {});
    }
  }, [student.studentId, currentIndex, isOnline]);

  // Send one answer to the backend, falling back to the durable offline queue (IndexedDB)
  const persistAnswer = async (questionId: string, answer: string, idx: number) => {
    if (typeof navigator !== "undefined" && navigator.onLine) {
      try {
        await apiAutoSaveAnswer({
          studentId: student.studentId,
          questionId,
          answer,
          currentQuestion: idx,
        });
        return;
      } catch (err) {
        console.warn("[QUIZ] Online save failed; staging in offline queue:", err);
      }
    }

    await queueOfflineAnswer({ questionId, answer, currentQuestion: idx });
  };

  const pendingSaveRef = useRef<{ questionId: string; answer: string; idx: number } | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      const pending = pendingSaveRef.current;
      if (pending) {
        pendingSaveRef.current = null;
        void persistAnswer(pending.questionId, pending.answer, pending.idx);
      }
    };
  }, []);

  // Handle Option / Answer change for current question (debounced for 400+ user high performance)
  const handleAnswerChange = (newAns: string) => {
    if (!currentQuestion) return;

    const updatedAnswers = { ...answers, [currentQuestion.id]: newAns };
    setAnswers(updatedAnswers);

    pendingSaveRef.current = {
      questionId: currentQuestion.id,
      answer: newAns,
      idx: currentIndex,
    };

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const pending = pendingSaveRef.current;
      if (!pending) return;
      pendingSaveRef.current = null;
      await persistAnswer(pending.questionId, pending.answer, pending.idx);
    }, 350);
  };

  // Submit Final Answers
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) {
      await persistAnswer(pending.questionId, pending.answer, pending.idx);
    }

    try {
      const res = await apiSubmitQuiz({
        studentId: student.studentId,
        answers: answers,
      });
      onSubmitted({
        totalScore: res.totalScore,
        correctCount: res.correctCount,
        incorrectCount: res.incorrectCount,
        unattemptedCount: res.unattemptedCount,
        strikesCount: violationCount,
        cheated: violationCount >= 2,
      });
    } catch (err) {
      console.error("Submission failed:", err);
      setSubmitError(
        "We could not submit your attempt. Please check your connection and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, student.studentId, answers, violationCount, onSubmitted]);

  // Anti-Cheating Event Listeners (Tab Switching & Focus Loss - Strict 2-Strike Rule)
  useEffect(() => {
    const handleViolation = () => {
      setViolationCount((prev) => {
        const newCount = prev + 1;
        if (newCount >= 2) {
          // Strike 2 ONLY: Close exam immediately and play loud alarm siren!
          playSecuritySiren();
          handleSubmit();
        } else {
          // Strike 1: Show 1st & only warning modal
          setShowWarningToast(true);
        }
        return newCount;
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden && violationCount < 2) {
        handleViolation();
      }
    };

    const handleBlur = () => {
      if (violationCount < 2) {
        handleViolation();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    // Strict Anti-Cheating Lockdown: Copy, Paste, Right-Click, Selection, DevTools, Extensions
    const notifyBlocked = (action: string) => {
      setBlockedActionNotice(`Security Alert: ${action} is strictly prohibited during the assessment.`);
      setTimeout(() => setBlockedActionNotice(""), 3500);
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      notifyBlocked("Right-clicking (Context Menu)");
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText("");
        }
      } catch {}
      notifyBlocked("Copying text");
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText("");
        }
      } catch {}
      notifyBlocked("Cutting text");
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      notifyBlocked("Pasting content");
    };

    const handleSelectStart = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
    };

    const handleDragStart = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Assessment in progress. Leaving this page will disrupt your exam.";
      return e.returnValue;
    };

    // DevTools detection via F12, Shortcuts, and Window anomaly
    const triggerDevToolsAlert = (triggerName: string) => {
      try {
        // Output large ASCII warning banner to console
        const nativeLog = console.warn || console.log;
        nativeLog.call(console, `%c${ASCII_SECURITY_BANNER}`, "color: #ef4444; font-weight: bold; font-family: monospace; font-size: 11px;");
      } catch {}
      setShowDevToolsModal(true);
      notifyBlocked(triggerName);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      if (e.key === "F12") {
        e.preventDefault();
        triggerDevToolsAlert("DevTools Access (F12)");
        return;
      }

      if (e.key === "PrintScreen") {
        e.preventDefault();
        notifyBlocked("Screen Capture");
        return;
      }

      if (isCtrlOrCmd) {
        const key = e.key.toLowerCase();
        if (e.shiftKey && (key === "i" || key === "j" || key === "c" || key === "k")) {
          e.preventDefault();
          triggerDevToolsAlert("DevTools Shortcut");
          return;
        }

        if (key === "u" || key === "s" || key === "p" || key === "a") {
          e.preventDefault();
          notifyBlocked(`Shortcut (Ctrl+${key.toUpperCase()})`);
          return;
        }

        if (key === "c" || key === "v" || key === "x") {
          e.preventDefault();
          notifyBlocked(`Clipboard shortcut (Ctrl+${key.toUpperCase()})`);
          return;
        }
      }
    };

    // Fullscreen and Split-Screen Monitoring
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (!isFs && violationCount < 2) {
        handleViolation();
      }
    };

    // DevTools & Split-Screen Detector
    const checkDevToolsResize = () => {
      const threshold = 160;
      const isSplit =
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold;
      setIsSplitScreenActive(isSplit);
      if (isSplit) {
        setShowDevToolsModal(true);
      }
    };

    // Global audio warmup on user gesture
    const unlockAudio = () => {
      getOrInitAudioContext();
    };

    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("selectstart", handleSelectStart);
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("drop", handleDrop);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", checkDevToolsResize);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Initial fullscreen & split-screen check
    checkDevToolsResize();
    try {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}

    const interval = setInterval(checkDevToolsResize, 1000);

    return () => {
      clearInterval(interval);
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("selectstart", handleSelectStart);
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("drop", handleDrop);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", checkDevToolsResize);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [violationCount, handleSubmit]);

  const requestEnterFullscreen = () => {
    try {
      document.documentElement.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(() => {});
    } catch {}
  };

  const persistCursor = (idx: number) => {
    if (!isOnline) return;
    apiAutoSaveAnswer({
      studentId: student.studentId,
      currentQuestion: idx,
    }).catch(() => {});
  };

  const handleNext = () => {
    if (currentIndex < shuffledOrder.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      persistCursor(nextIdx);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      persistCursor(prevIdx);
    }
  };

  const handleGridSelect = (gridIdx: number) => {
    setCurrentIndex(gridIdx);
    persistCursor(gridIdx);
  };

  const answeredCount = Object.values(answers).filter((a) => a && a.trim() !== "").length;

  return (
    <div
      className="max-w-5xl mx-auto my-6 px-4 pb-32 select-none"
      translate="no"
      spellCheck={false}
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
    >
      {/* Forced Fullscreen Enforcer Overlay */}
      {!isFullscreen && violationCount < 2 && (
        <div className="fixed inset-0 z-[130] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-4">
          <div className="bg-white border-4 border-rose-600 rounded-3xl p-8 sm:p-12 max-w-lg w-full shadow-2xl text-center space-y-6">
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border-2 border-rose-300">
              <ShieldAlert className="w-12 h-12" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-rose-600 uppercase tracking-tight">
                Full-Screen Mode Required
              </h2>
              <p className="text-sm text-slate-600 mt-2 font-semibold">
                Kindle Jr 5.0 assessment must be taken in exclusive full-screen mode to maintain test integrity.
              </p>
            </div>
            <button
              onClick={requestEnterFullscreen}
              className="w-full py-4 px-6 rounded-2xl font-black text-base text-white bg-blue-600 hover:bg-blue-700 shadow-xl transition-all"
            >
              Re-enter Full-Screen Mode
            </button>
          </div>
        </div>
      )}

      {/* Floating Anti-Cheat Lockdown Toast */}
      {blockedActionNotice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[110] bg-rose-600 text-white px-6 py-3.5 rounded-2xl shadow-2xl border-2 border-rose-400 flex items-center gap-3 animate-bounce">
          <AlertTriangle className="w-5 h-5 text-amber-300 flex-shrink-0" />
          <span className="text-sm font-black tracking-wide">{blockedActionNotice}</span>
        </div>
      )}

      {/* Brutal DevTools & Split-Screen Cheating Popup (Non-Dismissible while split screen is open) */}
      {showDevToolsModal && (
        <div className="fixed inset-0 z-[120] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
          <div className="bg-white border-4 border-rose-600 rounded-3xl p-8 sm:p-12 max-w-lg w-full shadow-2xl text-center space-y-6">
            <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border-2 border-rose-300 animate-pulse">
              <ShieldAlert className="w-12 h-12" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-rose-600 uppercase tracking-tight">
                hahaha u really thought we would over look this
              </h2>
              <p className="text-sm uppercase tracking-widest font-mono font-bold text-slate-500 mt-2">
                Security Violation • Console & Side-Screen Blocked
              </p>
            </div>
            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-5 text-left text-sm text-rose-900 font-medium leading-relaxed">
              ⚠️ Developer Tools, inspect element, split-screen, and console modifications are strictly prohibited during Kindle Jr 5.0. This attempt has been logged against your Student ID: <strong>{student.studentId}</strong>.
            </div>

            {isSplitScreenActive ? (
              <div className="p-4 bg-rose-100 border-2 border-rose-400 rounded-2xl text-rose-900 text-xs font-bold flex flex-col gap-1">
                <span>⛔ Side Inspector / Split-Screen Active!</span>
                <span className="text-slate-600 font-normal">Close the side DevTools panel or maximize the window to unlock the assessment.</span>
              </div>
            ) : (
              <button
                onClick={() => setShowDevToolsModal(false)}
                className="w-full py-4 px-6 rounded-2xl font-black text-base text-white bg-rose-600 hover:bg-rose-700 shadow-xl transition-all"
              >
                Close & Return to Assessment
              </button>
            )}
          </div>
        </div>
      )}

      {/* Strike 2: Terminated Modal + Loud Audio Siren */}
      {violationCount >= 2 && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-4">
          <div className="bg-white border-4 border-rose-600 rounded-3xl p-8 sm:p-12 max-w-lg w-full shadow-2xl text-center space-y-6">
            <div className="w-20 h-20 bg-rose-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-xl animate-bounce">
              <Volume2 className="w-12 h-12" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-rose-600 uppercase tracking-tight">
                CHEATING DETECTED • EXAM TERMINATED
              </h2>
              <p className="text-base text-slate-600 mt-3 font-semibold">
                Tab switching was detected again after the warning. Your assessment has been permanently closed, submitted automatically, and the security alarm has been triggered.
              </p>
            </div>
            <div className="bg-slate-100 rounded-2xl p-4 font-mono text-xs font-bold text-slate-700">
              Student ID: {student.studentId} | Name: {student.name}
            </div>
            {isSubmitting && (
              <div className="flex items-center justify-center gap-2 text-rose-600 font-bold text-lg">
                <Loader2 className="w-6 h-6 animate-spin" /> Auto-submitting responses...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strike 1: Warning Overlay (1 Warning Only) */}
      {showWarningToast && violationCount < 2 && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 sm:p-12 max-w-lg w-full shadow-2xl text-center border-4 border-amber-400 space-y-6">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border-2 border-amber-300">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                FINAL WARNING: Tab Switching Detected
              </h2>
              <p className="text-base text-slate-600 mt-3 font-medium">
                You switched tabs or minimized the assessment window. <strong>This is your 1st and ONLY warning.</strong> If you switch tabs or lose focus again, your exam will immediately terminate and a loud alarm will sound.
              </p>
            </div>
            <button
              onClick={() => setShowWarningToast(false)}
              className="w-full py-4 px-6 rounded-2xl font-black text-base text-white bg-amber-500 hover:bg-amber-600 shadow-xl transition-all"
            >
              I Understand • Continue Exam
            </button>
          </div>
        </div>
      )}

      {/* Part 3.4: Student Status & HUD */}
      <div className="bg-white/95 backdrop-blur-2xl rounded-2xl p-6 border-2 border-slate-200 shadow-sm mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm uppercase tracking-widest font-semibold text-slate-500">
          <div className="flex items-center space-x-4">
            <div>
              STUDENT: <span className="text-slate-900 font-bold ml-1">{student.name}</span>
            </div>
            <div className="h-5 w-[2px] bg-slate-200 hidden sm:block" />
            <div>
              ID: <span className="font-mono text-blue-600 font-bold ml-1">{student.studentId}</span>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2 text-lg">
              <span>ANSWERED:</span>
              <span className="font-mono text-emerald-600 font-bold">
                {answeredCount} / {totalQuestions}
              </span>
            </div>
            <Timer initialSeconds={remainingSeconds} onExpire={handleSubmit} />
            <button
              onClick={() => setShowConfirmModal(true)}
              className="py-3 px-6 border-2 border-transparent rounded-xl font-bold text-base text-white bg-blue-600 hover:bg-blue-700 shadow-md transition-all flex items-center gap-2"
            >
              <Send className="w-5 h-5" /> Submit
            </button>
          </div>
        </div>
      </div>

      {/* Part 3.5: Question Layout */}
      {currentQuestion && (
        <QuestionCard
          question={currentQuestion}
          questionIndex={currentIndex}
          totalQuestions={totalQuestions}
          userAnswer={answers[currentQuestion.id] || ""}
          onAnswerChange={handleAnswerChange}
        />
      )}

      {/* Part 3.6: Bottom Navigation Floating Dock */}
      <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t-2 border-slate-200 p-4 z-40 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className={`py-3.5 px-6 rounded-xl text-sm font-bold border-2 transition-all flex items-center gap-2 ${
              currentIndex === 0
                ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                : "border-slate-300 bg-white hover:bg-slate-100 text-slate-700 shadow-sm"
            }`}
          >
            <ArrowLeft className="w-4 h-4" /> Previous
          </button>

          <span className="text-sm font-bold font-mono text-slate-600">
            {currentIndex + 1} of {totalQuestions}
          </span>

          <button
            onClick={handleNext}
            disabled={currentIndex === totalQuestions - 1}
            className={`py-3.5 px-6 rounded-xl text-sm font-bold border-2 transition-all flex items-center gap-2 ${
              currentIndex === totalQuestions - 1
                ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                : "border-blue-600 bg-blue-600 hover:bg-blue-700 text-white shadow-md"
            }`}
          >
            Next <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl border-2 border-slate-200">
            <h3 className="text-xl font-black text-slate-900 mb-2">Confirm Final Submission</h3>
            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              You have answered <strong>{answeredCount}</strong> out of{" "}
              <strong>{totalQuestions}</strong> questions. Once submitted, you cannot change your answers.
            </p>

            {submitError && (
              <div className="mb-4 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 p-3 rounded-xl">
                {submitError}
              </div>
            )}

            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="py-2.5 px-4 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
              >
                Continue Test
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="py-2.5 px-5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow flex items-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
