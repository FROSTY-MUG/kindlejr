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
import { apiGetQuestions, Question, StudentData } from "../services/api";
import { ChevronDown } from "lucide-react";

type FlowStep = "register" | "track" | "quiz" | "submitted" | "admin";

export default function Home() {
  const [step, setStep] = useState<FlowStep>("register");
  const [student, setStudent] = useState<StudentData | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [shuffledOrder, setShuffledOrder] = useState<number[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(4200);
  const [submissionDetails, setSubmissionDetails] = useState<SubmissionResult | null>(null);

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

    if (st.selectedTrack && st.shuffledOrder && st.shuffledOrder.length > 0) {
      try {
        const fetchedQuestions = await apiGetQuestions(st.selectedTrack.toLowerCase());
        setQuestions(fetchedQuestions);
        setShuffledOrder(st.shuffledOrder);
        setAnswers(st.answers || {});
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
    <main className="relative min-h-[200vh] w-full bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950 overflow-x-hidden">
      {/* 3D Background Canvas */}
      <LandingHero3DWrapper />

      {/* Part 2.1: Parallax IEEE SB Translucent Watermark */}
      <motion.div
        style={{ y: logoY, opacity: logoOpacity }}
        className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none overflow-hidden"
      >
        <img
          src="/ieee-logo.png"
          alt="IEEE SB Watermark"
          className="w-[70vw] max-w-[700px] opacity-[0.03] grayscale pointer-events-none select-none"
        />
      </motion.div>

      {/* Fixed Header Bar with IEEE SB Logo Branding */}
      <header className="fixed top-0 left-0 w-full z-40 bg-slate-950/80 backdrop-blur-xl border-b border-white/10 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <img src="/ieee-logo.png" alt="IEEE SB Logo" className="h-10 w-auto object-contain" />
          <div className="h-5 w-[1px] bg-white/20" />
          <span className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-2">
            <span className="text-amber-400 font-extrabold">IEEE GEU SB</span>
            <span className="text-slate-500 font-normal">|</span>
            <span>Kindle Junior 5.0</span>
          </span>
        </div>

        <div className="text-xs uppercase tracking-widest font-mono text-slate-400 hidden sm:block">
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
            className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full bg-slate-900/80 border border-amber-500/30 backdrop-blur-md shadow-[0_0_25px_rgba(245,158,11,0.15)]"
          >
            <img src="/ieee-logo.png" alt="IEEE Logo" className="h-5 w-auto object-contain" />
            <span className="text-amber-400 text-xs sm:text-sm font-extrabold uppercase tracking-widest font-mono">
              IEEE Student Branch
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-300 text-xs sm:text-sm font-medium tracking-wide">
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
            <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight uppercase bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent drop-shadow-[0_4px_20px_rgba(245,158,11,0.3)]">
              IEEE GEU STUDENT BRANCH
            </h2>
            <div className="flex items-center justify-center gap-4 text-xs sm:text-sm uppercase font-mono text-amber-400/90 tracking-[0.35em] font-bold pt-1">
              <span className="w-10 sm:w-16 h-[1px] bg-gradient-to-r from-transparent to-amber-400/60" />
              Presents
              <span className="w-10 sm:w-16 h-[1px] bg-gradient-to-l from-transparent to-amber-400/60" />
            </div>
          </motion.div>

          {/* Event Title */}
          <motion.h1
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tight text-white drop-shadow-[0_10px_40px_rgba(0,0,0,0.8)]"
          >
            Kindle Junior <span className="text-amber-400 inline-block drop-shadow-[0_0_30px_rgba(245,158,11,0.7)]">5.0</span>
          </motion.h1>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-base sm:text-xl font-medium text-slate-300 tracking-wide max-w-2xl mx-auto"
          >
            The Premier Technical & Aptitude Challenge of Graphic Era University
          </motion.p>
        </div>

        {/* Scroll Down Indicator */}
        <div className="pb-4 animate-bounce flex flex-col items-center gap-1 text-slate-400 text-xs font-semibold">
          <span>Scroll to Register</span>
          <ChevronDown className="w-5 h-5 text-amber-400" />
        </div>
      </section>

      {/* VIEWPORT 2: Pre-Registration & Interactive Portal */}
      <section className="min-h-screen w-full flex items-center justify-center p-4 sm:p-8 relative z-10 pt-20">
        {step === "register" && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 0.6 }}
            className="w-full max-w-2xl bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-8 sm:p-12 shadow-2xl"
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
            className="w-full max-w-3xl bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl p-6 sm:p-10 shadow-2xl"
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
            <SubmissionView
              student={student}
              score={submissionDetails.totalScore}
              correctCount={submissionDetails.correctCount}
              incorrectCount={submissionDetails.incorrectCount}
              unattemptedCount={submissionDetails.unattemptedCount}
              totalQuestions={60}
            />
          </div>
        )}
      </section>
    </main>
  );
}
