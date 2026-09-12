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

const ASCII_CODE_CHEATING_BANNER = `
====================================================================================================
__     ______  _    _             _____  ______    _____ ____  _____  ______ 
\\ \\   / / __ \\| |  | |     /\\    |  __ \\|  ____|  / ____/ __ \\|  __ \\|  ____|
 \\ \\_/ / |  | | |  | |    /  \\   | |__) | |__    | |   | |  | | |  | | |__   
  \\   /| |  | | |  | |   / /\\ \\  |  _  /|  __|   | |   | |  | | |  | |  __|  
   | | | |__| | |__| |  / ____ \\ | | \\ \\| |____  | |___| |__| | |__| | |____ 
   |_|  \\____/ \\____/  /_/    \\_\\|_|  \\_\\______|  \\_____\\____/|_____/|______|
                                                                             
  _____ _    _ ______       _______ _____ _   _  _____                       
 / ____| |  | |  ____|   /\\|__   __|_   _| \\ | |/ ____|                      
| |    | |__| | |__     /  \\  | |    | | |  \\| | |  __                       
| |    |  __  |  __|   / /\\ \\ | |    | | | . \` | | |_ |                      
| |____| |  | | |____ / ____ \\| |   _| |_| |\\  | |__| |                      
 \\_____|_|  |_|______/_/    \\_\\|_|  |_____|_| \\_|\\_____|                      
                                                                             
 _____   ____    _   _  ____ _______   _____   ____   _____ _______          
|  __ \\ / __ \\  | \\ | |/ __ \\__   __| |  __ \\ / __ \\ |_   _|__   __|         
| |  | | |  | | |  \\| | |  | | | |    | |  | | |  | |  | |    | |            
| |  | | |  | | | . \` | |  | | | |    | |  | | |  | |  | |    | |            
| |__| | |__| | | |\\  | |__| | | |    | |__| | |__| | _| |_   | |            
|_____/ \\____/  |_| \\_|\\____/  |_|    |_____/ \\____/ |_____|  |_|            
                                                                             
          /\\   / ____|   /\\   |_   _| \\ | |                                   
         /  \\ | |  __   /  \\    | | |  \\| |                                   
        / /\\ \\| | |_ | / /\\ \\   | | | . \` |                                   
       / ____ \\ |__| |/ ____ \\ _| |_| |\\  |                                   
      /_/    \\_\\_____/_/    \\_\\_____|_| \\_|                                   

                   YOU ARE CODE CHEATING, DO NOT DO IT AGAIN.
====================================================================================================
`;

// Self-invoking function that immediately clears the console and prints the massive ASCII warning
if (typeof window !== "undefined") {
  (function () {
    try {
      console.clear();
      console.log(
        "%c" + ASCII_CODE_CHEATING_BANNER,
        "color: red; font-size: 20px; font-weight: bold; font-family: monospace;"
      );
    } catch (e) {}
  })();
}

let globalAudioCtx: AudioContext | null = null;
let preloadedSirenAudio: HTMLAudioElement | null = null;

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

// Preload loud audio object during user gesture to bypass browser autoplay restrictions
export function preloadSirenAudio() {
  try {
    if (typeof window !== "undefined") {
      if (!preloadedSirenAudio) {
        preloadedSirenAudio = new Audio(
          "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
        );
        preloadedSirenAudio.loop = true;
        preloadedSirenAudio.volume = 1.0;
        preloadedSirenAudio.preload = "auto";
      }
      preloadedSirenAudio.load();
      getOrInitAudioContext();
    }
  } catch (e) {
    console.warn("Audio preload error:", e);
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

// Triggers both preloaded HTML5 audio and synthetic Web Audio siren at full volume
export function playPreloadedSiren() {
  try {
    if (preloadedSirenAudio) {
      preloadedSirenAudio.volume = 1.0;
      preloadedSirenAudio.currentTime = 0;
      preloadedSirenAudio.play().catch(() => {});
    }
  } catch {}
  playSecuritySiren();
}

export function checkIsFullscreen(): boolean {
  if (typeof window === "undefined") return true;
  const doc = document as any;
  const isDocFullscreen = Boolean(
    doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
  );
  if (isDocFullscreen) return true;
  // Fallback: exact viewport geometry matching full screen dimensions
  const isGeometryFullscreen =
    Math.abs(window.screen.width - window.innerWidth) <= 10 &&
    Math.abs(window.screen.height - window.innerHeight) <= 10;
  return isGeometryFullscreen;
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

  // Anti-Cheating state (2-Strike Rule with durable localStorage & Firestore persistence)
  const [violationCount, setViolationCount] = useState<number>(() => {
    let strikes = 0;
    try {
      if (typeof window !== "undefined") {
        const local = localStorage.getItem(`kindle_strikes_${student.studentId}`);
        if (local) strikes = Math.max(strikes, parseInt(local, 10) || 0);
        const sess = sessionStorage.getItem(`kindle_strikes_${student.studentId}`);
        if (sess) strikes = Math.max(strikes, parseInt(sess, 10) || 0);
      }
    } catch {}
    if (typeof student.violationCount === "number") {
      strikes = Math.max(strikes, student.violationCount);
    }
    if (typeof student.strikesCount === "number") {
      strikes = Math.max(strikes, student.strikesCount);
    }
    return strikes;
  });
  const [showWarningToast, setShowWarningToast] = useState<boolean>(false);
  const [showDevToolsModal, setShowDevToolsModal] = useState<boolean>(false);
  const [isSplitScreenActive, setIsSplitScreenActive] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => checkIsFullscreen());
  const [blockedActionNotice, setBlockedActionNotice] = useState<string>("");
  const isExamStartedRef = useRef<boolean>(checkIsFullscreen());

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

  const violationCountRef = useRef<number>(violationCount);
  const lastViolationTimeRef = useRef<number>(0);

  useEffect(() => {
    violationCountRef.current = violationCount;
  }, [violationCount]);

  // Submit Final Answers
  const handleSubmit = useCallback(
    async (forceCheated = false) => {
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

      const isCheated = forceCheated || violationCountRef.current >= 2 || Boolean(student.cheated);

      try {
        const res = await apiSubmitQuiz({
          studentId: student.studentId,
          answers: answers,
          cheated: isCheated,
        });
        onSubmitted({
          totalScore: res.totalScore,
          correctCount: res.correctCount,
          incorrectCount: res.incorrectCount,
          unattemptedCount: res.unattemptedCount,
          strikesCount: Math.max(violationCountRef.current, isCheated ? 2 : 0),
          cheated: isCheated,
        });
      } catch (err) {
        console.error("Submission failed:", err);
        setSubmitError(
          "We could not submit your attempt. Please check your connection and try again."
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, student.studentId, student.cheated, answers, onSubmitted]
  );

  // If student already has 2 strikes or cheated flag on mount, immediately terminate assessment
  useEffect(() => {
    if (violationCount >= 2 || student.cheated) {
      playPreloadedSiren();
      handleSubmit(true);
    }
  }, []);

  // Anti-Cheating Event Listeners (Tab Switching, Focus Loss, F11, & Full-Screen Tampering)
  useEffect(() => {
    const handleViolation = (reason = "Violation") => {
      const now = Date.now();
      if (now - lastViolationTimeRef.current < 350) {
        return;
      }
      lastViolationTimeRef.current = now;

      violationCountRef.current += 1;
      const newCount = violationCountRef.current;
      try {
        localStorage.setItem(`kindle_strikes_${student.studentId}`, String(newCount));
        sessionStorage.setItem(`kindle_strikes_${student.studentId}`, String(newCount));
      } catch {}
      setViolationCount(newCount);

      // Instantly push strike count to backend API so it is locked immutably in Firestore
      apiAutoSaveAnswer({
        studentId: student.studentId,
        currentQuestion: currentIndex,
        violationCount: newCount,
      }).catch((err) => {
        console.warn("[QUIZ] Failed to push violation count to backend:", err);
      });

      if (newCount >= 2) {
        // Strike 2 ONLY: Close exam immediately and play loud alarm siren!
        playPreloadedSiren();
        handleSubmit(true);
      } else {
        // Strike 1: Show 1st & only warning modal
        setShowWarningToast(true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && violationCountRef.current < 2) {
        handleViolation("Tab Switched");
      }
    };

    const handleBlur = () => {
      if (violationCountRef.current < 2) {
        handleViolation("Window Lost Focus");
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
        nativeLog.call(
          console,
          `%c${ASCII_CODE_CHEATING_BANNER}`,
          "color: red; font-weight: bold; font-family: monospace; font-size: 16px;"
        );
      } catch {}
      setShowDevToolsModal(true);
      notifyBlocked(triggerName);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Intercept F11 & Escape: completely blocks native browser full-screen toggling
      if (e.key === "F11" || e.keyCode === 122) {
        e.preventDefault();
        e.stopPropagation();
        handleViolation("F11 Key Press (Full-Screen Exit Attempt)");
        return false;
      }

      if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        e.stopPropagation();
        handleViolation("Escape Key Press (Full-Screen Exit Attempt)");
        return false;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Block F12
      if (e.key === "F12") {
        e.preventDefault();
        e.stopPropagation();
        triggerDevToolsAlert("DevTools Access (F12)");
        return false;
      }

      // Screenshot Prevention: Windows PrintScreen and Mac Meta+Shift+3 / Meta+Shift+4
      const isMacScreenshot =
        (e.metaKey && e.shiftKey && (e.key === "3" || e.key === "4")) ||
        (e.metaKey && e.shiftKey && (e.code === "Digit3" || e.code === "Digit4"));

      if (e.key === "PrintScreen" || isMacScreenshot) {
        e.preventDefault();
        e.stopPropagation();
        notifyBlocked("Screen Capture Attempt Blocked");

        if (typeof document !== "undefined") {
          document.body.style.filter = "blur(50px)";
          document.body.style.transition = "filter 0.1s ease";
        }

        handleViolation("Screen Capture Attempt");

        setTimeout(() => {
          if (typeof document !== "undefined") {
            document.body.style.filter = "";
          }
        }, 3000);
        return false;
      }

      if (isCtrlOrCmd) {
        const key = e.key.toLowerCase();

        // Block tab-switching shortcuts (Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+T, Ctrl+N, Ctrl+W)
        if (e.key === "Tab" || key === "t" || key === "n" || key === "w") {
          e.preventDefault();
          e.stopPropagation();
          handleViolation(`Tab Shortcut Blocked (Ctrl+${e.key.toUpperCase()})`);
          return false;
        }

        // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+Shift+K
        if (e.shiftKey && (key === "i" || key === "j" || key === "c" || key === "k")) {
          e.preventDefault();
          e.stopPropagation();
          triggerDevToolsAlert("DevTools Shortcut (Ctrl+Shift+" + key.toUpperCase() + ")");
          return false;
        }

        // Block Ctrl+U (View Source)
        if (key === "u") {
          e.preventDefault();
          e.stopPropagation();
          triggerDevToolsAlert("View Source Shortcut (Ctrl+U)");
          return false;
        }

        if (key === "s" || key === "p" || key === "a") {
          e.preventDefault();
          e.stopPropagation();
          notifyBlocked(`Shortcut (Ctrl+${key.toUpperCase()})`);
          return false;
        }

        if (key === "c" || key === "v" || key === "x") {
          e.preventDefault();
          e.stopPropagation();
          notifyBlocked(`Clipboard shortcut (Ctrl+${key.toUpperCase()})`);
          return false;
        }
      }

      // Block Alt navigation shortcuts
      if (e.altKey && (e.key === "Tab" || e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        e.stopPropagation();
        handleViolation("Alt Navigation Attempt");
        return false;
      }
    };

    // Fullscreen and Geometry Monitoring
    const verifyFullscreen = () => {
      const isFs = checkIsFullscreen();
      setIsFullscreen(isFs);
      if (!isFs && isExamStartedRef.current) {
        handleViolation("Exited Full-Screen Mode");
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

    // Chrome Extension Blocking (DOM Monitoring via MutationObserver)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement) {
            const tag = node.tagName.toLowerCase();
            const id = (node.id || "").toLowerCase();
            const className = (typeof node.className === "string" ? node.className : "").toLowerCase();

            const isExtension =
              tag.includes("grammarly") ||
              tag.includes("chatgpt") ||
              tag.includes("copilot") ||
              tag.includes("extension") ||
              id.includes("grammarly") ||
              id.includes("chatgpt") ||
              className.includes("grammarly") ||
              node.hasAttribute("data-grammarly-part") ||
              node.hasAttribute("data-gr-ext-installed") ||
              node.hasAttribute("data-chatgpt-ext") ||
              (node.parentNode === document.body &&
                !["__next", "portal-root", "next"].includes(id) &&
                !className.includes("portal") &&
                tag !== "script" &&
                tag !== "style");

            if (isExtension) {
              try {
                node.remove();
              } catch {}
              notifyBlocked("Unauthorized browser extension / DOM injection removed");
            }
          }
        }
      }
    });

    if (typeof document !== "undefined" && document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    // Global audio warmup on user gesture
    const unlockAudio = () => {
      getOrInitAudioContext();
    };

    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    document.addEventListener("fullscreenchange", verifyFullscreen);
    (document as any).addEventListener?.("webkitfullscreenchange", verifyFullscreen);
    (document as any).addEventListener?.("mozfullscreenchange", verifyFullscreen);
    (document as any).addEventListener?.("MSFullscreenChange", verifyFullscreen);
    window.addEventListener("resize", verifyFullscreen);
    window.addEventListener("resize", checkDevToolsResize);
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("selectstart", handleSelectStart);
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("drop", handleDrop);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // Initial fullscreen & split-screen check
    verifyFullscreen();
    checkDevToolsResize();

    // 400ms Heartbeat: continuously checks geometry and catches F11 or silent un-fullscreening
    const heartbeatInterval = setInterval(() => {
      verifyFullscreen();
      checkDevToolsResize();
    }, 400);

    return () => {
      clearInterval(heartbeatInterval);
      observer.disconnect();
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("fullscreenchange", verifyFullscreen);
      (document as any).removeEventListener?.("webkitfullscreenchange", verifyFullscreen);
      (document as any).removeEventListener?.("mozfullscreenchange", verifyFullscreen);
      (document as any).removeEventListener?.("MSFullscreenChange", verifyFullscreen);
      window.removeEventListener("resize", verifyFullscreen);
      window.removeEventListener("resize", checkDevToolsResize);
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("selectstart", handleSelectStart);
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("drop", handleDrop);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [currentIndex, student.studentId, handleSubmit]);

  const requestEnterFullscreen = () => {
    try {
      const elem = document.documentElement as any;
      const rfs =
        elem.requestFullscreen ||
        elem.webkitRequestFullscreen ||
        elem.mozRequestFullScreen ||
        elem.msRequestFullscreen;
      if (rfs) {
        rfs.call(elem).then(() => {
          setIsFullscreen(true);
          isExamStartedRef.current = true;
        }).catch(() => {});
      }
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

  const carouselRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the active palette node into center view smoothly
  useEffect(() => {
    if (carouselRef.current) {
      const activeNode = document.getElementById(`palette-node-${currentIndex}`);
      if (activeNode) {
        activeNode.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest",
        });
      }
    }
  }, [currentIndex]);

  const answeredCount = Object.values(answers).filter((a) => a && a.trim() !== "").length;

  return (
    <div
      className="max-w-5xl mx-auto my-6 px-4 pb-36 select-none"
      translate="no"
      spellCheck={false}
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
    >
      {/* Forced Fullscreen Enforcer Overlay */}
      {!isFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-2xl flex items-center justify-center p-4">
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
              className="w-full py-4 px-6 rounded-xl font-black text-base text-white bg-blue-600 hover:bg-blue-700 shadow-xl transition-all"
            >
              Re-enter Full-Screen Mode
            </button>
          </div>
        </div>
      )}

      {/* Floating Anti-Cheat Lockdown Toast */}
      {blockedActionNotice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[110] bg-rose-600 text-white px-6 py-3.5 rounded-xl shadow-2xl border-2 border-rose-400 flex items-center gap-3 animate-bounce">
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
                className="w-full py-4 px-6 rounded-xl font-black text-base text-white bg-rose-600 hover:bg-rose-700 shadow-xl transition-all"
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
              <h2 className="text-2xl sm:text-3xl font-black text-slate-800">
                FINAL WARNING: Tab Switching Detected
              </h2>
              <p className="text-base text-slate-600 mt-3 font-medium">
                You switched tabs or minimized the assessment window. <strong>This is your 1st and ONLY warning.</strong> If you switch tabs or lose focus again, your exam will immediately terminate and a loud alarm will sound.
              </p>
            </div>
            <button
              onClick={() => setShowWarningToast(false)}
              className="w-full py-4 px-6 rounded-xl font-black text-base text-white bg-amber-500 hover:bg-amber-600 shadow-xl transition-all"
            >
              I Understand • Continue Exam
            </button>
          </div>
        </div>
      )}

      {/* Top Header Card: Track Info, Timer & Pink Submit Button */}
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl p-6 border border-slate-200 shadow-2xl mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm font-semibold text-slate-500">
          <div className="flex items-center space-x-3.5">
            <span className="text-slate-800 font-bold text-base">
              {student.selectedTrack ? `${student.selectedTrack} Assessment` : "Kindle Jr 5.0"}
            </span>
            <div className="h-5 w-[1.5px] bg-slate-200 hidden sm:block" />
            <span className="text-xs font-bold font-mono px-3 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200">
              {totalQuestions} MCQs • 1 Mark Each
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <Timer initialSeconds={remainingSeconds} onExpire={() => handleSubmit(false)} />
            <button
              onClick={() => setShowConfirmModal(true)}
              className="py-3 px-6 rounded-xl font-black text-sm text-white bg-pink-500 hover:bg-pink-600 shadow-lg shadow-pink-500/20 transition-all flex items-center gap-2 border-2 border-transparent"
            >
              <Send className="w-4 h-4" /> Submit
            </button>
          </div>
        </div>
      </div>

      {/* Question Layout */}
      {currentQuestion && (
        <QuestionCard
          question={currentQuestion}
          questionIndex={currentIndex}
          totalQuestions={totalQuestions}
          userAnswer={answers[currentQuestion.id] || ""}
          onAnswerChange={handleAnswerChange}
        />
      )}

      {/* Part 3: High-Clarity Question Palette (Bottom Carousel) */}
      <div className="fixed bottom-0 left-0 w-full bg-white/95 backdrop-blur-xl border-t border-slate-200 z-50 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <div className="max-w-5xl mx-auto space-y-3">
          {/* 3.2 Real-Time Status HUD */}
          <div className="flex items-center justify-between px-1">
            <div className="text-sm font-bold text-slate-700 truncate max-w-[50%]">
              {student.name} | {student.studentId}
            </div>
            <div className="text-sm font-bold text-blue-600">
              Answered: {answeredCount} • Left: {totalQuestions - answeredCount}
            </div>
          </div>

          {/* 3.3 Horizontally Scrolling Question Nodes Carousel */}
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all flex items-center gap-1.5 flex-shrink-0 ${
                currentIndex === 0
                  ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-sm"
              }`}
            >
              <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Previous</span>
            </button>

            <div
              ref={carouselRef}
              className="flex gap-3 overflow-x-auto scrollbar-hide items-center py-2 flex-1 scroll-smooth px-1"
            >
              {Array.from({ length: totalQuestions }, (_, i) => {
                const qOriginalIdx = shuffledOrder[i] ?? i;
                const q = questions[qOriginalIdx];
                const isAnswered = Boolean(q && answers[q.id] && answers[q.id].trim() !== "");
                const isCurrent = i === currentIndex;

                let stateClass = "bg-white text-slate-400 border-slate-200 hover:border-blue-300";
                if (isCurrent) {
                  stateClass = "bg-blue-600 text-white border-blue-700 scale-110 shadow-lg z-10";
                } else if (isAnswered) {
                  stateClass = "bg-green-100 text-green-700 border-green-300";
                }

                return (
                  <button
                    key={i}
                    id={`palette-node-${i}`}
                    onClick={() => handleGridSelect(i)}
                    className={`w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-lg font-mono text-sm font-bold border transition-all duration-200 cursor-pointer ${stateClass}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleNext}
              disabled={currentIndex === totalQuestions - 1}
              className={`py-3 px-4 rounded-xl text-sm font-bold border transition-all flex items-center gap-1.5 flex-shrink-0 ${
                currentIndex === totalQuestions - 1
                  ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "border-blue-600 bg-blue-600 hover:bg-blue-700 text-white shadow-md"
              }`}
            >
              <span className="hidden sm:inline">Next</span> <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-200">
            <h3 className="text-xl font-black text-slate-800 mb-2">Confirm Final Submission</h3>
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
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting}
                className="py-2.5 px-5 rounded-xl text-sm font-bold bg-pink-500 hover:bg-pink-600 text-white shadow-lg shadow-pink-500/20 flex items-center gap-2 border-2 border-transparent"
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
