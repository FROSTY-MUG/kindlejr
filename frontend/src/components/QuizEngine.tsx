import React, { useState, useEffect, useRef, useCallback } from "react";
import { QuestionCard } from "./QuestionCard";
import { Timer } from "./Timer";
import {
  apiAutoSaveAnswer,
  apiSubmitQuiz,
  Question,
  StudentData,
} from "../services/api";
import { useOfflineSync } from "../hooks/useOfflineSync";
import { ArrowLeft, ArrowRight, CheckCircle, Send, Loader2, AlertTriangle, X } from "lucide-react";

export interface SubmissionResult {
  totalScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
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

export const QuizEngine: React.FC<QuizEngineProps> = ({
  student,
  questions,
  shuffledOrder,
  initialCurrentIndex = 0,
  initialAnswers = {},
  initialRemainingSeconds = 4200,
  onSubmitted,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(initialCurrentIndex);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(initialRemainingSeconds);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);

  // Anti-Cheating state
  const [violationCount, setViolationCount] = useState<number>(0);
  const [showWarningToast, setShowWarningToast] = useState<boolean>(false);

  const { isOnline, queueOfflineAnswer } = useOfflineSync(student.studentId);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerStartedRef = useRef<boolean>(false);

  // Map position in shuffled order array to ground truth question
  const currentOriginalIndex = shuffledOrder[currentIndex] ?? 0;
  const currentQuestion = questions[currentOriginalIndex];

  // Anti-Cheating Event Listeners (Tab Switching & Focus Loss)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setViolationCount((prev) => prev + 1);
        setShowWarningToast(true);
      }
    };

    const handleBlur = () => {
      setViolationCount((prev) => prev + 1);
      setShowWarningToast(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Start timer backend trigger on initial render of Question 1 if not started yet
  useEffect(() => {
    if (!timerStartedRef.current && isOnline) {
      timerStartedRef.current = true;
      apiAutoSaveAnswer({
        studentId: student.studentId,
        currentQuestion: currentIndex,
        startTimerNow: true,
      }).catch((e) => console.warn("Failed to trigger start timer flag:", e));
    }
  }, [student.studentId, currentIndex, isOnline]);

  // Handle Option / Answer change for current question
  const handleAnswerChange = (newAns: string) => {
    if (!currentQuestion) return;

    const updatedAnswers = { ...answers, [currentQuestion.id]: newAns };
    setAnswers(updatedAnswers);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      if (navigator.onLine) {
        try {
          await apiAutoSaveAnswer({
            studentId: student.studentId,
            questionId: currentQuestion.id,
            answer: newAns,
            currentQuestion: currentIndex,
          });
        } catch (err) {
          console.warn("Online save failed, queuing in IndexedDB...", err);
          await queueOfflineAnswer({
            questionId: currentQuestion.id,
            answer: newAns,
            currentQuestion: currentIndex,
          });
        }
      } else {
        await queueOfflineAnswer({
          questionId: currentQuestion.id,
          answer: newAns,
          currentQuestion: currentIndex,
        });
      }
    }, 250);
  };

  // Submit Final Answers
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
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
      });
    } catch (err) {
      console.error("Submission failed:", err);
      onSubmitted({ totalScore: 0, correctCount: 0, incorrectCount: 0, unattemptedCount: 0 });
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, student.studentId, answers, onSubmitted]);

  // Navigation handlers
  const handleNext = () => {
    if (currentIndex < shuffledOrder.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      if (isOnline) {
        apiAutoSaveAnswer({
          studentId: student.studentId,
          currentQuestion: nextIdx,
        }).catch(console.warn);
      }
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      if (isOnline) {
        apiAutoSaveAnswer({
          studentId: student.studentId,
          currentQuestion: prevIdx,
        }).catch(console.warn);
      }
    }
  };

  const handleGridSelect = (gridIdx: number) => {
    setCurrentIndex(gridIdx);
    if (isOnline) {
      apiAutoSaveAnswer({
        studentId: student.studentId,
        currentQuestion: gridIdx,
      }).catch(console.warn);
    }
  };

  const answeredCount = Object.values(answers).filter((a) => a && a.trim() !== "").length;

  return (
    <div className="max-w-5xl mx-auto my-6 px-4 pb-32">
      {/* Anti-Cheat Warning Toast */}
      {showWarningToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-rose-600/95 backdrop-blur-md text-white px-6 py-3 rounded-xl flex items-center gap-3 shadow-2xl border border-rose-400">
          <AlertTriangle className="w-5 h-5 text-amber-300 flex-shrink-0" />
          <span className="font-bold text-xs sm:text-sm">
            Warning: Tab switching detected ({violationCount}). Do not leave the assessment window.
          </span>
          <button
            onClick={() => setShowWarningToast(false)}
            className="ml-3 p-1 rounded-lg hover:bg-rose-700 text-rose-100 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Part 3.4: Student Status & HUD */}
      <div className="bg-slate-900/60 backdrop-blur-2xl rounded-2xl p-4 border border-white/10 shadow-2xl mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-xs uppercase tracking-widest font-semibold text-slate-400">
          <div className="flex items-center space-x-4">
            <div>
              STUDENT: <span className="text-slate-100 font-bold ml-1">{student.name}</span>
            </div>
            <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />
            <div>
              ID: <span className="font-mono text-amber-400 font-bold ml-1">{student.studentId}</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5">
              <span>ANSWERED:</span>
              <span className="font-mono text-emerald-400 font-bold text-sm">{answeredCount} / 60</span>
            </div>
            <Timer initialSeconds={remainingSeconds} onExpire={handleSubmit} />
            <button
              onClick={() => setShowConfirmModal(true)}
              className="py-2 px-4 rounded-xl font-bold text-xs text-slate-950 bg-amber-500 hover:bg-amber-400 shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Submit
            </button>
          </div>
        </div>
      </div>

      {/* Question Component */}
      <div className="space-y-6">
        {currentQuestion ? (
          <QuestionCard
            question={currentQuestion}
            questionIndex={currentIndex}
            totalQuestions={shuffledOrder.length}
            userAnswer={answers[currentQuestion.id] || ""}
            onAnswerChange={handleAnswerChange}
          />
        ) : (
          <div className="p-8 text-center text-slate-400 bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/10">
            Kindly wait a moment.
          </div>
        )}

        {/* Navigation Controls */}
        <div className="flex items-center justify-between bg-slate-900/60 backdrop-blur-2xl rounded-2xl p-4 border border-white/10 shadow-lg">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="py-2.5 px-5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all border border-white/10"
          >
            <ArrowLeft className="w-4 h-4" /> Previous
          </button>

          <span className="text-xs font-mono font-semibold text-slate-400">
            QUESTION <span className="text-amber-400 font-bold">{currentIndex + 1}</span> / {shuffledOrder.length}
          </span>

          {currentIndex < shuffledOrder.length - 1 ? (
            <button
              onClick={handleNext}
              className="py-2.5 px-5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition-all"
            >
              Next <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="py-2.5 px-5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all"
            >
              Review & Submit <CheckCircle className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Part 3.2: Fixed Bottom Question Carousel */}
      <div className="fixed bottom-0 left-0 w-full h-24 bg-slate-950/95 backdrop-blur-xl border-t border-white/10 z-50">
        <div className="flex flex-row overflow-x-auto scrollbar-hide items-center gap-3 px-6 h-full max-w-7xl mx-auto">
          {shuffledOrder.map((origIdx, displayIdx) => {
            const q = questions[origIdx];
            const isAnswered = q && answers[q.id] && answers[q.id].trim() !== "";
            const isCurrent = currentIndex === displayIdx;

            return (
              <button
                key={q ? q.id : displayIdx}
                onClick={() => handleGridSelect(displayIdx)}
                className={`w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-lg font-mono text-sm font-bold border transition-all duration-200 ${
                  isCurrent
                    ? "bg-amber-500 text-slate-950 border-amber-400 scale-110 shadow-[0_0_15px_rgba(245,158,11,0.4)] z-10"
                    : isAnswered
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-slate-900 text-slate-500 border-white/5 hover:border-white/20"
                }`}
              >
                {displayIdx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center">
            <h3 className="text-xl font-bold text-slate-100 mb-2">Confirm Quiz Submission</h3>
            <p className="text-xs text-slate-400 mb-6">
              You have answered <strong className="text-amber-400 font-mono">{answeredCount}</strong> out of{" "}
              <strong className="text-amber-400 font-mono">{shuffledOrder.length}</strong> questions. Are you sure you want to finish?
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-3 rounded-xl font-semibold text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 border border-white/10"
              >
                Continue Quiz
              </button>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-3 rounded-xl font-bold text-xs text-slate-950 bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                  </>
                ) : (
                  "Yes, Submit Now"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
