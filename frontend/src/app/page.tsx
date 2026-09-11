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
  apiSubmitQuiz,
  EXAM_DURATION_SECONDS,
  TOTAL_QUESTIONS,
  Question,
  StudentData,
} from "../services/api";
import { ChevronDown } from "lucide-react";

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

  const { isOnline } = useOfflineSync(student?.studentId || "");

  // Check for admin session on page mount
  useEffect(() => {
    try {
      if (sessionStorage.getItem("admin_session") === "true") {
        setStep("admin");
      }
    } catch {}
  }, []);

  // Parallax Scroll Hooks for IEEE SB Watermark
  const { scrollY } = useScroll();
  const logoY = useTransform(scrollY, [0, 1000], [0, 200]);
  const logoOpacity = useTransform(scrollY, [0, 800], [0.03, 0.01]);

  // Parallax Scroll Hooks for Registration Section
  const regY = useTransform(scrollY, [300, 900], [60, 0]);
  const regScale = useTransform(scrollY, [300, 900], [0.92, 1]);
  const regOpacity = useTransform(scrollY, [300, 700], [0, 1]);

  // Registration Completed
  const handleRegistrationComplete = (registeredStudent: StudentData) => {
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
    setStudent((prev) => (prev ? { ...prev, selectedTrack: track } : null));
    setQuestions(fetchedQuestions);
    setShuffledOrder(shuffled);
    setCurrentQuestionIndex(0);
    setStep("quiz");
  };

  // State Recovery Handler
  const handleRestoreState = async (stateRes: {
    student: StudentData;
    remainingSeconds: number;
    timeExpired: boolean;
  }) => {
    const st = stateRes.student;
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

    // Absolute-time recovery: if the 60-minute window already elapsed while the
    // student was away, the attempt is auto-submitted with whatever was saved.
    // This prevents a reload from resetting the clock and is the reason the
    // server recomputes elapsed time from startedAt rather than trusting us.
    if (stateRes.timeExpired || stateRes.remainingSeconds <= 0) {
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
      setRecoveryNotice(
        "Your 60-minute assessment window has ended. Your saved answers were submitted automatically."
      );
      setStep("submitted");
      return;
    }

    if (st.selectedTrack && st.shuffledOrder && st.shuffledOrder.length > 0) {
      try {
        const fetchedQuestions = await apiGetQuestions(st.selectedTrack.toLowerCase());
        setQuestions(fetchedQuestions);
        setShuffledOrder(st.shuffledOrder);
        setAnswers(st.answers || {});
        setCurrentQuestionIndex(st.currentQuestion || 0);
        // The server is authoritative on how much time remains.
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
    <main className="relative min-h-[200vh] w-full bg-slate-50 text-slate-900 font-sans selection:bg-blue-200 overflow-x-hidden">
      {/* 3D Background Canvas (Removed for Light Theme) */}

      {/* Part 2.1: Parallax GEU Watermark */}
      <motion.div
        style={{ y: logoY }}
        className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none overflow-hidden opacity-50 blur-md"
      >
        <img
          src="/geu-logo.png"
          alt="GEU Watermark"
          className="w-[80vw] max-w-[800px] pointer-events-none select-none grayscale opacity-30"
        />
      </motion.div>

      {/* Fixed Header Bar with IEEE SB Logo Branding */}
      <header className="fixed top-0 left-0 w-full z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <img src="/ieee-logo.png" alt="IEEE SB Logo" className="h-10 w-auto object-contain" />
          <div className="h-5 w-[1px] bg-slate-300" />
          <span className="text-sm sm:text-lg font-black tracking-tight text-slate-800 flex items-center gap-2">
            <span className="text-blue-600 font-extrabold">IEEE GEU SB</span>
            <span className="text-slate-400 font-normal">|</span>
            <span>Kindle Junior 5.0</span>
          </span>
        </div>

        <div className="text-xs sm:text-sm uppercase tracking-widest font-mono text-slate-500 hidden sm:block font-semibold">
          Graphic Era (Deemed to be University)
        </div>
      </header>

      {/* VIEWPORT 1: Hero Section */}
      <section className="h-screen w-full flex flex-col items-center justify-between pt-24 pb-8 px-6 text-center relative z-10">
        <div className="pt-4">
          <motion.div
            initial={{ opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-white/90 border border-blue-200 backdrop-blur-md shadow-sm"
          >
            <img src="/ieee-logo.png" alt="IEEE Logo" className="h-6 w-auto object-contain" />
            <span className="text-blue-600 text-sm sm:text-base font-extrabold uppercase tracking-widest font-mono">
              IEEE Student Branch
            </span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600 text-sm sm:text-base font-medium tracking-wide">
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
            <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight uppercase bg-gradient-to-r from-blue-600 via-blue-500 to-blue-400 bg-clip-text text-transparent drop-shadow-sm">
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
            The Premier Technical & Aptitude Challenge of Graphic Era University
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
            className="w-full max-w-2xl bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-8 sm:p-12 shadow-2xl"
          >
            <RegistrationForm
              onComplete={handleRegistrationComplete}
              onRestoreState={handleRestoreState}
              onAdminTrigger={handleAdminTrigger}
            />
          </motion.div>
        )}

        {step === "track" && student && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-3xl bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-6 sm:p-10 shadow-2xl"
          >
            <TrackSelection student={student} onTrackInit={handleTrackInit} />
          </motion.div>
        )}

        {step === "quiz" && student && questions.length > 0 && (
          <div className="w-full max-w-6xl">
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
              <div className="mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800 shadow-sm">
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
            />
          </div>
        )}
      </section>
    </main>
  );
}
