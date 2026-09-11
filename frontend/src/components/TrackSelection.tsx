import React, { useState } from "react";
import { Code2, Terminal, Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { apiGetQuestions, apiInitQuiz, Question, StudentData } from "../services/api";
import { preloadSirenAudio } from "./QuizEngine";

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
      if (typeof document !== "undefined" && document.documentElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}
    preloadSirenAudio();
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
      <div className="text-center mb-8">
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">
          Select Your Programming Track
        </h2>
        <p className="text-slate-500 text-base mt-2">
          Welcome <strong className="text-blue-600">{student.name}</strong>! Choose the programming language track for your assessment.
        </p>
      </div>

      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200 p-8 sm:p-10">
        {/* Track Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          {/* C Language Option */}
          <div
            onClick={() => setSelectedTrack("C")}
            className={`cursor-pointer rounded-xl border-2 p-6 transition-all relative overflow-hidden flex flex-col justify-between ${
              selectedTrack === "C"
                ? "border-blue-600 bg-blue-50/80 shadow-md ring-2 ring-blue-600/20"
                : "border-slate-200 bg-slate-50/60 hover:border-blue-300 hover:bg-slate-100/80"
            }`}
          >
            {selectedTrack === "C" && (
              <span className="absolute top-4 right-4 bg-blue-600 text-white rounded-full p-1.5 shadow-sm">
                <Sparkles className="w-4 h-4" />
              </span>
            )}
            <div>
              <div className="w-14 h-14 rounded-xl bg-blue-100 text-blue-600 border border-blue-200 flex items-center justify-center font-bold font-mono text-2xl mb-5">
                C
              </div>
              <h3 className="font-bold text-slate-800 text-xl">C Language Track</h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed font-medium">
                60 multiple choice questions covering C syntax, data types, operators, conditionals, and loops.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between text-sm font-mono font-bold">
              <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-xl border border-blue-200">
                C Assessment
              </span>
              <span className="px-3 py-1.5 bg-slate-800 text-white rounded-xl">
                60 Qs
              </span>
            </div>
          </div>

          {/* Python Track Option */}
          <div
            onClick={() => setSelectedTrack("Python")}
            className={`cursor-pointer rounded-xl border-2 p-6 transition-all relative overflow-hidden flex flex-col justify-between ${
              selectedTrack === "Python"
                ? "border-blue-600 bg-blue-50/80 shadow-md ring-2 ring-blue-600/20"
                : "border-slate-200 bg-slate-50/60 hover:border-blue-300 hover:bg-slate-100/80"
            }`}
          >
            {selectedTrack === "Python" && (
              <span className="absolute top-4 right-4 bg-blue-600 text-white rounded-full p-1.5 shadow-sm">
                <Sparkles className="w-4 h-4" />
              </span>
            )}
            <div>
              <div className="w-14 h-14 rounded-xl bg-blue-100 text-blue-600 border border-blue-200 flex items-center justify-center font-bold font-mono text-xl mb-5">
                <Terminal className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-slate-800 text-xl">Python Track</h3>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed font-medium">
                60 multiple choice questions covering Python core concepts, variables, operators, collections, and control structures.
              </p>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between text-sm font-mono font-bold">
              <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-xl border border-blue-200">
                Python Assessment
              </span>
              <span className="px-3 py-1.5 bg-slate-800 text-white rounded-xl">
                60 Qs
              </span>
            </div>
          </div>
        </div>

        {/* Exam Structure Notice */}
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 mb-8 text-sm text-slate-600 space-y-2">
          <p className="font-bold text-slate-800 flex items-center gap-2">
            <Code2 className="w-5 h-5 text-blue-600" />
            Exam Structure Overview (60 Questions Total):
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-600 pl-2 font-medium">
            <li>Total: 60 Multiple-Choice Questions in {selectedTrack === "C" ? "C Language" : "Python"} (1 Mark Each)</li>
            <li>Randomized question sequence uniquely shuffled for every candidate.</li>
            <li>Strict <span className="font-bold text-blue-600">60-Minute Timer</span> starts automatically on Question 1 render.</li>
          </ul>
        </div>

        {errorMsg && (
          <p className="text-sm text-rose-500 font-bold mb-6 text-center bg-rose-50 py-3 rounded-xl border border-rose-200">{errorMsg}</p>
        )}

        {/* Start Assessment Button */}
        <button
          onClick={handleStartQuiz}
          disabled={isLoading}
          className="w-full py-4 px-8 rounded-xl font-black text-lg text-white bg-pink-500 hover:bg-pink-600 shadow-xl shadow-pink-500/20 flex items-center justify-center gap-2 group transition-all border-2 border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Kindly wait a moment.
            </>
          ) : (
            <>
              Start 60-Minute Assessment
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};
