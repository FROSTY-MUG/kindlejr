"use client";

import React, { useState, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { LandingHero3DWrapper } from "../components/LandingHero3DWrapper";
import { RegistrationForm } from "../components/RegistrationForm";
import { TrackSelection } from "../components/TrackSelection";
import { QuizEngine, SubmissionResult } from "../components/QuizEngine";
import { SubmissionView } from "../components/SubmissionView";
import { AdminDashboard } from "../components/AdminDashboard";
import { useOfflineSync } from "../hooks/useOfflineSync";
import {
  apiGetQuestions,
  apiGetState,
  apiSubmitQuiz,
  EXAM_DURATION_SECONDS,
  TOTAL_QUESTIONS,
  Question,
  StudentData,
} from "../services/api";
import { ChevronDown, Loader2 } from "lucide-react";

type FlowStep = "register" | "track" | "quiz" | "submitted" | "admin";

export default function Home() {
  const [step, setStep] = useState<FlowStep>("register");
  const [student, setStudent] = useState<StudentData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [shuffledOrder, setShuffledOrder] = useState<number[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(EXAM_DURATION_SECONDS);
  const [submissionDetails, setSubmissionDetails] = useState<SubmissionResult | null>(null);
  const [recoveryNotice, setRecoveryNotice] = useState<string>("");
  const [isRecovering, setIsRecovering] = useState<boolean>(false);

  const { isOnline } = useOfflineSync(student?.studentId || "");

  // Check for admin session or admin URL parameter on page mount
  useEffect(() => {
    try {
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get("admin") === "true" || urlParams.get("admin") === "1" || urlParams.get("admin") === "kindle_jr_5_admin_secret_2026") {
          sessionStorage.setItem("admin_session", "true");
          setStep("admin");
          return;
        }
        if (sessionStorage.getItem("admin_session") === "true") {
          setStep("admin");
          return;
        }

        // Auto-restore active student session on page refresh or recovery
        const savedStudentId =
          sessionStorage.getItem("kindle_active_student_id") ||
          localStorage.getItem("kindle_active_student_id");

        if (savedStudentId && step === "register") {
          setIsRecovering(true);
          apiGetState(savedStudentId)
            .then((stateRes: any) => {
              if (stateRes && stateRes.student) {
                handleRestoreState(stateRes);
              }
            })
            .catch((err: any) => {
              console.warn("Auto-recovery failed or session stale:", err);
            })
            .finally(() => {
              setIsRecovering(false);
            });
        }
      }
    } catch {}
  }, []);

  // Parallax Scroll Hooks for Graphic Era Logo Backdrop
  const { scrollY } = useScroll();
  const logoY = useTransform(scrollY, [0, 1200], [0, 260]);
  const logoScale = useTransform(scrollY, [0, 1200], [1, 1.25]);
  const logoRotate = useTransform(scrollY, [0, 1200], [0, 12]);
  const logoOpacity = useTransform(scrollY, [0, 600, 1200], [0.18, 0.25, 0.12]);

  // Parallax Scroll Hooks for Registration Section
  const regY = useTransform(scrollY, [300, 900], [60, 0]);
  const regScale = useTransform(scrollY, [300, 900], [0.92, 1]);
  const regOpacity = useTransform(scrollY, [300, 700], [0, 1]);

  // Registration Completed
  const handleRegistrationComplete = (registeredStudent: StudentData) => {
    try {
      sessionStorage.setItem("kindle_active_student_id", registeredStudent.studentId);
      localStorage.setItem("kindle_active_student_id", registeredStudent.studentId);
    } catch {}
    setStudent(registeredStudent);
    setStep("track");
  };

  // Secret Admin Triggered
  const handleAdminTrigger = () => {
    setStep("admin");
  };

  // Track Initialization Completed
  const handleTrackInit = (
    track: string,
    fetchedQuestions: Question[],
    shuffled: number[]
  ) => {
    if (!student) return;
    try {
      sessionStorage.setItem("kindle_active_student_id", student.studentId);
      localStorage.setItem("kindle_active_student_id", student.studentId);
    } catch {}
    setStudent((prev) => (prev ? { ...prev, selectedTrack: track } : null));
    setQuestions(fetchedQuestions);
    setShuffledOrder(shuffled);
    setCurrentQuestionIndex(0);
    setStep("quiz");
  };

  // State Recovery Handler with 15-Minute Reconnection Buffer & 30-Second Threshold
  const handleRestoreState = async (stateRes: {
    student: StudentData;
    remainingSeconds: number;
    timeExpired?: boolean;
    disconnectedSeconds?: number;
    bufferExpired?: boolean;
    shouldAutoSubmit?: boolean;
  }) => {
    const st = stateRes.student;
    try {
      sessionStorage.setItem("kindle_active_student_id", st.studentId);
      localStorage.setItem("kindle_active_student_id", st.studentId);
      const backendStrikes = st.violationCount || st.strikesCount || 0;
      if (backendStrikes > 0) {
        localStorage.setItem(`kindle_strikes_${st.studentId}`, String(backendStrikes));
        sessionStorage.setItem(`kindle_strikes_${st.studentId}`, String(backendStrikes));
      }
    } catch {}
    setStudent(st);

    if (st.isSubmitted) {
      setSubmissionDetails({
        totalScore: st.totalScore || 0,
        correctCount: st.correctCount || 0,
        incorrectCount: st.incorrectCount || 0,
        unattemptedCount: st.unattemptedCount || 0,
      });
      setStep("submitted");
      return;
    }

    // Check if candidate was flagged for cheating or triggered 2 strikes
    const strikeCount = Math.max(
      st.violationCount || 0,
      st.strikesCount || 0,
      parseInt(typeof window !== "undefined" ? localStorage.getItem(`kindle_strikes_${st.studentId}`) || "0" : "0", 10)
    );

    if (st.cheated || strikeCount >= 2) {
      try {
        const res = await apiSubmitQuiz({
          studentId: st.studentId,
          answers: st.answers || {},
          cheated: true,
        });
        setSubmissionDetails({
          totalScore: res.totalScore,
          correctCount: res.correctCount,
          incorrectCount: res.incorrectCount,
          unattemptedCount: res.unattemptedCount,
        });
      } catch (err) {
        setSubmissionDetails({
          totalScore: st.totalScore || 0,
          correctCount: st.correctCount || 0,
          incorrectCount: st.incorrectCount || 0,
          unattemptedCount: st.unattemptedCount || 0,
        });
      }
      setRecoveryNotice(
        "Your assessment was terminated due to security policy violations (2 strikes triggered). Your answers were locked and submitted."
      );
      setStep("submitted");
      return;
    }

    // Disconnection & Timer Assessment:
    // 1. If remaining time is <= 30 seconds (or <= 10 seconds), auto-submit immediately.
    // 2. If disconnected for > 15 minutes (bufferExpired), auto-submit and grade saved answers.
    const isExpired = stateRes.timeExpired || stateRes.remainingSeconds <= 30 || stateRes.bufferExpired || stateRes.shouldAutoSubmit;

    if (isExpired) {
      try {
        const res = await apiSubmitQuiz({
          studentId: st.studentId,
          answers: st.answers || {},
        });
        setSubmissionDetails({
          totalScore: res.totalScore,
          correctCount: res.correctCount,
          incorrectCount: res.incorrectCount,
          unattemptedCount: res.unattemptedCount,
        });
      } catch (err) {
        console.error("Auto-submission on expiry failed:", err);
        setSubmissionDetails({
          totalScore: st.totalScore || 0,
          correctCount: st.correctCount || 0,
          incorrectCount: st.incorrectCount || 0,
          unattemptedCount: st.unattemptedCount || 0,
        });
      }

      let notice = "Your 60-minute assessment window has ended. Your saved answers were submitted automatically.";
      if (stateRes.bufferExpired) {
        notice = "The 15-minute reconnection buffer has elapsed. Your saved answers were graded and submitted automatically.";
      } else if (stateRes.remainingSeconds <= 30 && stateRes.remainingSeconds > 0) {
        notice = `Your session had less than 30 seconds remaining (${stateRes.remainingSeconds}s left). Your saved answers were submitted and graded.`;
      }
      setRecoveryNotice(notice);
      setStep("submitted");
      return;
    }

    // Candidate has > 30 seconds remaining and returned within 15-minute buffer:
    // Restore questions, shuffled order, saved answers (e.g. Q1-Q7), and place them at current active question (e.g. Q8)
    if (st.selectedTrack && st.shuffledOrder && st.shuffledOrder.length > 0) {
      try {
        const fetchedQuestions = await apiGetQuestions(st.selectedTrack.toLowerCase());
        setQuestions(fetchedQuestions);
        setShuffledOrder(st.shuffledOrder);
        setAnswers(st.answers || {});
        // Resume at the exact question index they were on
        setCurrentQuestionIndex(st.currentQuestion || 0);
        setRemainingSeconds(stateRes.remainingSeconds);
        setStep("quiz");
      } catch (err) {
        console.error("Error restoring quiz questions:", err);
      }
    } else if (st.studentId) {
      setStep("track");
    }
  };

  // Quiz Final Submission Handler
  const handleQuizSubmitted = (result: SubmissionResult) => {
    setSubmissionDetails(result);
    setStep("submitted");
  };

  // If Admin Dashboard is active, render full-screen Admin Dashboard View
  if (step === "admin") {
    return (
      <AdminDashboard
        onExit={() => {
          try {
            sessionStorage.removeItem("admin_session");
          } catch {}
          setStep("register");
        }}
      />
    );
  }

  return (
    <main className="relative min-h-[200vh] w-full bg-slate-50 text-slate-900 font-sans selection:bg-blue-100 overflow-x-hidden">
      {/* Parallax Center Background Watermark - Isolated GEU Circular Crest */}
      <div className="fixed inset-0 -z-10 flex items-center justify-center pointer-events-none overflow-hidden">
        <motion.div
          style={{ y: logoY, scale: logoScale, rotate: logoRotate }}
          className="flex items-center justify-center pointer-events-none"
        >
          <img
            src="/geu-logo.png"
            alt="Graphic Era University Crest Watermark"
            className="w-[60vw] max-w-[600px] h-auto object-contain opacity-50 blur-[4px] select-none"
          />
        </motion.div>
      </div>

      {/* Top-Left Header Logo - High Resolution GEU Crest & IEEE SB */}
      <div className="absolute top-6 left-6 z-50 flex items-center">
        <img
          src="/ieee-logo.png"
          alt="Graphic Era | IEEE SB"
          className="h-14 w-auto object-contain"
        />
      </div>

      {/* Fixed Header Bar for Scrolled Experience */}
      <header className="fixed top-0 left-0 w-full z-40 bg-white/95 backdrop-blur-xl border-b border-slate-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3.5">
          <img
            src="/ieee-logo.png"
            alt="Graphic Era | IEEE SB"
            className="h-14 w-auto object-contain"
          />
          <div className="h-6 w-[1.5px] bg-slate-200 hidden sm:block" />
          <span className="text-sm sm:text-base font-black tracking-tight text-slate-800 flex items-center gap-2">
            <span className="text-blue-600 font-extrabold">IEEE GEU SB</span>
            <span className="text-slate-300 font-normal hidden sm:inline">|</span>
            <span className="hidden sm:inline text-slate-800">Kindle Junior 5.0</span>
          </span>
        </div>

        <div className="text-xs sm:text-sm uppercase tracking-widest font-mono text-slate-600 hidden sm:block font-bold bg-slate-100 px-4 py-1.5 rounded-xl border border-slate-200">
          Graphic Era (Deemed to be University)
        </div>
      </header>

      {/* VIEWPORT 1: Hero Section */}
      <section className="h-screen w-full flex flex-col items-center justify-between pt-28 pb-8 px-6 text-center relative z-10">
        <div className="pt-2">
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-white/90 border border-slate-200 backdrop-blur-xl shadow-sm"
          >
            <img src="/header-logo.png" alt="IEEE GEU Logo" className="h-6 w-auto object-contain" />
            <span className="text-blue-600 text-sm sm:text-base font-extrabold uppercase tracking-widest font-mono">
              IEEE Student Branch
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-700 text-sm sm:text-base font-semibold tracking-wide">
              Graphic Era (Deemed to be University)
            </span>
          </motion.div>
        </div>

        <div className="max-w-5xl space-y-6">
          {/* Big Name for IEEE GEU SB */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="space-y-2"
          >
            <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight uppercase bg-gradient-to-r from-blue-700 via-blue-600 to-sky-600 bg-clip-text text-transparent drop-shadow-sm">
              IEEE GEU STUDENT BRANCH
            </h2>
            <div className="flex items-center justify-center gap-4 text-xs sm:text-sm uppercase font-mono text-blue-600 tracking-[0.35em] font-bold pt-1">
              <span className="w-10 sm:w-16 h-[1px] bg-gradient-to-r from-transparent to-blue-400" />
              Presents
              <span className="w-10 sm:w-16 h-[1px] bg-gradient-to-l from-transparent to-blue-400" />
            </div>
          </motion.div>

          {/* Event Title */}
          <motion.h1
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tight text-slate-800 drop-shadow-sm"
          >
            Kindle Junior <span className="text-blue-600 inline-block">5.0</span>
          </motion.h1>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-lg sm:text-2xl font-medium text-slate-600 tracking-wide max-w-2xl mx-auto"
          >
            The Premier Technical Challenge of Graphic Era University
          </motion.p>
        </div>

        {/* Scroll Down Indicator */}
        <div className="pb-4 animate-bounce flex flex-col items-center gap-1 text-slate-500 text-sm font-semibold">
          <span>Scroll to Register</span>
          <ChevronDown className="w-6 h-6 text-blue-600" />
        </div>
      </section>

      {/* VIEWPORT 2: Pre-Registration & Interactive Portal */}
      <section className="min-h-screen w-full flex items-center justify-center p-4 sm:p-8 relative z-10 pt-20">
        {step === "register" && (
          <motion.div
            style={{ y: regY, scale: regScale, opacity: regOpacity }}
            className="w-full max-w-2xl bg-white/90 backdrop-blur-xl border border-slate-200 rounded-3xl p-8 sm:p-12 shadow-2xl"
          >
            {isRecovering ? (
              <div className="flex flex-col items-center justify-center py-20 text-blue-600">
                <Loader2 className="w-12 h-12 animate-spin mb-4" />
                <h3 className="text-xl font-bold font-mono uppercase tracking-widest text-slate-800">
                  Recovering Session...
                </h3>
                <p className="text-slate-500 text-sm mt-2 font-semibold">
                  Restoring your active Kindle Jr 5.0 assessment
                </p>
              </div>
            ) : (
              <RegistrationForm
                onComplete={handleRegistrationComplete}
                onRestoreState={handleRestoreState}
                onAdminTrigger={handleAdminTrigger}
              />
            )}
          </motion.div>
        )}

        {step === "track" && student && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-3xl bg-white/90 backdrop-blur-xl border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-2xl"
          >
            <TrackSelection student={student} onTrackInit={handleTrackInit} />
          </motion.div>
        )}

        {step === "quiz" && student && questions.length > 0 && (
          <div className="w-full max-w-5xl">
            <QuizEngine
              student={student}
              questions={questions}
              shuffledOrder={shuffledOrder}
              initialCurrentIndex={currentQuestionIndex}
              initialAnswers={answers}
              initialRemainingSeconds={remainingSeconds}
              onSubmitted={handleQuizSubmitted}
            />
          </div>
        )}

        {step === "submitted" && student && submissionDetails && (
          <div className="w-full max-w-xl">
            {recoveryNotice && (
              <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800 shadow-sm">
                {recoveryNotice}
              </div>
            )}
            <SubmissionView
              student={student}
              score={submissionDetails.totalScore}
              correctCount={submissionDetails.correctCount}
              incorrectCount={submissionDetails.incorrectCount}
              unattemptedCount={submissionDetails.unattemptedCount}
              totalQuestions={TOTAL_QUESTIONS}
              strikesCount={submissionDetails.strikesCount}
            />
          </div>
        )}
      </section>
    </main>
  );
}
