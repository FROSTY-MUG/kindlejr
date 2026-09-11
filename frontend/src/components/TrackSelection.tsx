import React, { useState } from "react";
import { Code2, Terminal, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { apiGetQuestions, apiInitQuiz, Question, StudentData } from "../services/api";

interface TrackSelectionProps {
  student: StudentData;
  onTrackInit: (
    track: string,
    questions: Question[],
    shuffledOrder: number[]
  ) => void;
}

export const TrackSelection: React.FC<TrackSelectionProps> = ({
  student,
  onTrackInit,
}) => {
  const [selectedTrack, setSelectedTrack] = useState<"C" | "Python">("C");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleStartQuiz = async () => {
    setIsLoading(true);
    setErrorMsg("");
    try {
      const rawQuestions = await apiGetQuestions(selectedTrack.toLowerCase());
      const orderArray = Array.from({ length: rawQuestions.length }, (_, i) => i);
      for (let i = orderArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [orderArray[i], orderArray[j]] = [orderArray[j], orderArray[i]];
      }

      await apiInitQuiz({
        studentId: student.studentId,
        selectedTrack: selectedTrack,
        shuffledOrder: orderArray,
      });

      onTrackInit(selectedTrack, rawQuestions, orderArray);
    } catch (err) {
      console.error("Track initialization failed:", err);
      setErrorMsg("Unable to initialize quiz track. Please check network connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
          Select Your Programming Track
        </h2>
        <p className="text-slate-400 text-xs sm:text-sm mt-1">
          Welcome <strong className="text-amber-400">{student.name}</strong>! Choose the programming language track for your assessment.
        </p>
      </div>

      <div className="bg-slate-900/60 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8">
        {/* Track Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* C Language Option */}
          <div
            onClick={() => setSelectedTrack("C")}
            className={`cursor-pointer rounded-2xl border p-6 transition-all relative overflow-hidden flex flex-col justify-between ${
              selectedTrack === "C"
                ? "border-amber-500/80 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/40"
                : "border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-slate-800/40"
            }`}
          >
            {selectedTrack === "C" && (
              <span className="absolute top-3 right-3 bg-amber-500 text-slate-950 rounded-full p-1 shadow">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            )}
            <div>
              <div className="w-12 h-12 rounded-xl bg-slate-800 text-amber-400 border border-white/10 flex items-center justify-center font-bold font-mono text-xl mb-4">
                C
              </div>
              <h3 className="font-bold text-slate-100 text-lg">C Language Track</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                45 questions covering print statements, arithmetic, precedence, if/else, and basic loops in C.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono font-bold">
              <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                15 Aptitude + 45 C
              </span>
              <span className="px-2.5 py-1 bg-amber-500 text-slate-950 rounded-xl">
                60 Qs
              </span>
            </div>
          </div>

          {/* Python Track Option */}
          <div
            onClick={() => setSelectedTrack("Python")}
            className={`cursor-pointer rounded-2xl border p-6 transition-all relative overflow-hidden flex flex-col justify-between ${
              selectedTrack === "Python"
                ? "border-amber-500/80 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/40"
                : "border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-slate-800/40"
            }`}
          >
            {selectedTrack === "Python" && (
              <span className="absolute top-3 right-3 bg-amber-500 text-slate-950 rounded-full p-1 shadow">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
            )}
            <div>
              <div className="w-12 h-12 rounded-xl bg-slate-800 text-amber-400 border border-white/10 flex items-center justify-center font-bold font-mono text-xl mb-4">
                <Terminal className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-100 text-lg">Python Track</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                45 questions covering basic syntax, operators, string operations, if/elif/else, and simple loops in Python.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono font-bold">
              <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
                15 Aptitude + 45 Python
              </span>
              <span className="px-2.5 py-1 bg-amber-500 text-slate-950 rounded-xl">
                60 Qs
              </span>
            </div>
          </div>
        </div>

        {/* Exam Structure Notice */}
        <div className="bg-slate-950/60 rounded-2xl p-4 border border-white/10 mb-6 text-xs text-slate-400 space-y-1">
          <p className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Code2 className="w-4 h-4 text-amber-400" />
            Exam Structure Overview (60 Questions Total):
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1">
            <li>Part 1: 15 Aptitude & Logical Reasoning Questions (1 Mark Each)</li>
            <li>Part 2: 45 Coding Questions in {selectedTrack} (1 Mark Each)</li>
            <li>Strict 70-Minute Timer starts automatically on Question 1 render.</li>
          </ul>
        </div>

        {errorMsg && (
          <p className="text-xs text-rose-400 font-semibold mb-4 text-center">{errorMsg}</p>
        )}

        {/* Start Assessment Button */}
        <button
          onClick={handleStartQuiz}
          disabled={isLoading}
          className="w-full py-3.5 px-6 rounded-xl font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 group transition-all"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Kindly wait a moment.
            </>
          ) : (
            <>
              Start 70-Minute Assessment
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
