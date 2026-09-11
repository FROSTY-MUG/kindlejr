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
  initialRemainingSeconds = EXAM_DURATION_SECONDS,
  onSubmitted,
}) => {
  // Absolute exam deadline, derived once from the server-provided remaining
  // time. Anchoring to a fixed instant (rather than decrementing a counter)
  // means a throttled background tab, a reload or a clock drift can never buy a
  // student extra time. When the deadline passes we force a submission.
  const deadlineRef = useRef<number>(Date.now() + initialRemainingSeconds * 1000);
  const totalQuestions = shuffledOrder.length || TOTAL_QUESTIONS;
  const [currentIndex, setCurrentIndex] = useState<number>(initialCurrentIndex);
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(initialRemainingSeconds);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>("");

  // Anti-Cheating state
  const [violationCount, setViolationCount] = useState<number>(0);
  const [showWarningToast, setShowWarningToast] = useState<boolean>(false);

  const { isOnline, queueOfflineAnswer } = useOfflineSync(student.studentId);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timerStartedRef = useRef<boolean>(false);

  // Map position in shuffled order array to ground truth question
  const currentOriginalIndex = shuffledOrder[currentIndex] ?? 0;
  const currentQuestion = questions[currentOriginalIndex];



  // Start timer backend trigger on initial render of Question 1 if not started yet
  useEffect(() => {
    if (!timerStartedRef.current && isOnline) {
      timerStartedRef.current = true;
      apiAutoSaveAnswer({
        studentId: student.studentId,
        currentQuestion: currentIndex,
        startTimerNow: true,
      }).catch(() => {
        /* timer start is re-attempted on the next real auto-save */
      });
    }
  }, [student.studentId, currentIndex, isOnline]);

  // Send one answer to the backend, falling back to the durable offline queue
  // (IndexedDB) whenever the request fails. Shared by the debounced save and by
  // the unmount flush so the two paths can never diverge.
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
        console.warn("[QUIZ] Online save failed; staging answer in offline queue:", err);
      }
    }

    await queueOfflineAnswer({ questionId, answer, currentQuestion: idx });
  };

  // Keep the latest pending save so an unmount (submit, timer expiry, route
  // change) can flush it instead of dropping the answer.
  const pendingSaveRef = useRef<{ questionId: string; answer: string; idx: number } | null>(null);

  // Flush a debounced-but-not-yet-sent answer when the engine unmounts.
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      const pending = pendingSaveRef.current;
      if (pending) {
        pendingSaveRef.current = null;
        void persistAnswer(pending.questionId, pending.answer, pending.idx);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle Option / Answer change for current question
  const handleAnswerChange = (newAns: string) => {
    if (!currentQuestion) return;

    const updatedAnswers = { ...answers, [currentQuestion.id]: newAns };
    setAnswers(updatedAnswers);

    pendingSaveRef.current = {
      questionId: currentQuestion.id,
      answer: newAns,
      idx: currentIndex,
    };

    // Debounce: replace an in-flight timer so only the latest keystroke is sent.
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      const pending = pendingSaveRef.current;
      if (!pending) return;
      pendingSaveRef.current = null;
      await persistAnswer(pending.questionId, pending.answer, pending.idx);
    }, 250);
  };

  // Submit Final Answers
  const handleSubmit = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    // Cancel any debounced save that has not fired yet - the full answer set is
    // being sent below, so a late single-answer write would be redundant.
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
      });
    } catch (err) {
      // apiSubmitQuiz grades locally on a server failure, so reaching here means
      // even the local evaluation could not complete.
      console.error("Submission failed:", err);
      setSubmitError(
        "We could not submit your attempt. Please check your connection and try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, student.studentId, answers, onSubmitted]);

  // Anti-Cheating Event Listeners (Tab Switching & Focus Loss)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && violationCount < 3) {
        setViolationCount((prev) => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            handleSubmit();
          } else {
            setShowWarningToast(true);
          }
          return newCount;
        });
      }
    };

    const handleBlur = () => {
      if (violationCount < 3) {
        setViolationCount((prev) => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            handleSubmit();
          } else {
            setShowWarningToast(true);
          }
          return newCount;
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, [violationCount, handleSubmit]);

  // Navigation handlers
  // Navigation only needs to persist the cursor position. Failures here are
  // non-critical (the position is re-sent on the next answer change), so they
  // are swallowed without noisy console warnings.
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
    <div className="max-w-5xl mx-auto my-6 px-4 pb-32">
      {/* Strike 3: Terminated Modal */}
      {violationCount >= 3 && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white border-2 border-rose-500 rounded-2xl p-8 sm:p-12 max-w-lg w-full shadow-2xl text-center">
            <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-6" />
            <h2 className="text-3xl font-black text-slate-900 mb-4">Assessment Terminated</h2>
            <p className="text-lg text-slate-600 mb-6">
              You have exceeded the maximum allowed tab switches. Your assessment has been permanently locked and your progress has been submitted automatically.
            </p>
            {isSubmitting && (
              <div className="flex items-center justify-center gap-2 text-rose-600 font-bold text-lg">
                <Loader2 className="w-6 h-6 animate-spin" /> Submitting...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Strike 1 & 2: Warning Overlay */}
      {showWarningToast && violationCount < 3 && (
        <div className="fixed inset-0 z-[100] bg-gradient-to-br from-pink-500/95 to-rose-600/95 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 sm:p-12 max-w-lg w-full shadow-2xl text-center border-2 border-rose-200">
            <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-6" />
            <h2 className="text-3xl font-black text-slate-900 mb-4">Warning: Tab switching detected</h2>
            <p className="text-lg text-slate-600 mb-8 font-medium">
              Do not leave the assessment window. This is strike {violationCount} of 3. On the third strike, your assessment will be terminated automatically.
            </p>
            <button
              onClick={() => setShowWarningToast(false)}
              className="w-full py-4 px-6 rounded-xl font-bold text-lg text-white bg-rose-600 hover:bg-rose-700 shadow-xl transition-all"
            >
              I Understand
            </button>
          </div>
        </div>
      )}

      {/* Part 3.4: Student Status & HUD */}
      <div className="bg-white/90 backdrop-blur-2xl rounded-2xl p-6 border-2 border-slate-200 shadow-sm mb-8">
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
              className="py-3 px-6 border-2 border-transparent rounded-xl font-bold text-base text-white bg-pink-500 hover:bg-pink-600 shadow-md transition-all flex items-center gap-2"
            >
              <Send className="w-5 h-5" /> Submit
            </button>
          </div>
        </div>
      </div>

      {/* Question Component */}
      <div className="space-y-8">
        {currentQuestion ? (
          <QuestionCard
            question={currentQuestion}
            questionIndex={currentIndex}
            totalQuestions={shuffledOrder.length}
            userAnswer={answers[currentQuestion.id] || ""}
            onAnswerChange={handleAnswerChange}
          />
        ) : (
          <div className="p-12 text-center text-slate-500 bg-white/90 backdrop-blur-2xl rounded-2xl border-2 border-slate-200 text-lg">
            Kindly wait a moment.
          </div>
        )}

        {/* Navigation Controls */}
        <div className="flex items-center justify-between bg-white/90 backdrop-blur-2xl rounded-2xl p-6 border-2 border-slate-200 shadow-sm">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="py-4 px-6 rounded-xl text-lg font-bold border-2 border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
          >
            <ArrowLeft className="w-5 h-5" /> Previous
          </button>

          <span className="text-base font-mono font-bold text-slate-500">
            QUESTION <span className="text-blue-600 font-black text-xl">{currentIndex + 1}</span> / {shuffledOrder.length}
          </span>

          {currentIndex < shuffledOrder.length - 1 ? (
            <button
              onClick={handleNext}
              className="py-4 px-6 rounded-xl text-lg font-bold border-2 border-blue-600 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-md transition-all"
            >
              Next <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="py-4 px-6 rounded-xl text-lg font-bold border-2 border-pink-500 bg-pink-500 hover:bg-pink-600 text-white flex items-center gap-2 shadow-md transition-all"
            >
              Review & Submit <CheckCircle className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Part 3.2: Fixed Bottom Question Carousel */}
      <div className="fixed bottom-0 left-0 w-full h-28 bg-white/95 backdrop-blur-xl border-t border-slate-200 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
        <div className="flex flex-row overflow-x-auto scrollbar-hide items-center gap-4 px-6 h-full max-w-7xl mx-auto">
          {shuffledOrder.map((origIdx, displayIdx) => {
            const q = questions[origIdx];
            const isAnswered = q && answers[q.id] && answers[q.id].trim() !== "";
            const isCurrent = currentIndex === displayIdx;

            return (
              <button
                key={q ? q.id : displayIdx}
                onClick={() => handleGridSelect(displayIdx)}
                className={`w-14 h-14 flex-shrink-0 flex items-center justify-center rounded-xl font-mono text-lg font-bold border-2 transition-all duration-200 ${
                  isCurrent
                    ? "bg-blue-600 text-white border-blue-600 scale-110 shadow-lg z-10"
                    : isAnswered
                    ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                    : "bg-slate-50 text-slate-400 border-slate-200 hover:border-blue-300 hover:text-blue-500"
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
        <div className="fixed inset-0 z-[60] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-8 sm:p-10 max-w-lg w-full shadow-2xl text-center">
            <h3 className="text-2xl font-black text-slate-900 mb-2">Confirm Quiz Submission</h3>
            <p className="text-base text-slate-600 mb-8 font-medium">
              You have answered <strong className="text-blue-600 font-mono text-lg">{answeredCount}</strong> out of{" "}
              <strong className="text-blue-600 font-mono text-lg">{shuffledOrder.length}</strong> questions. Are you sure you want to finish?
            </p>

            {submitError && (
              <p className="mb-6 text-sm font-bold text-rose-600 bg-rose-50 border-2 border-rose-200 rounded-xl px-4 py-3">
                {submitError}
              </p>
            )}

            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-4 rounded-xl font-bold text-lg text-slate-600 bg-slate-100 hover:bg-slate-200 border-2 border-slate-200 transition-all"
              >
                Continue Quiz
              </button>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-4 rounded-xl font-bold text-lg text-white bg-pink-500 hover:bg-pink-600 shadow-lg border-2 border-transparent transition-all flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Submitting...
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
