import React from "react";
import { Question } from "../services/api";
import { HelpCircle, Edit3 } from "lucide-react";

interface QuestionCardProps {
  question: Question;
  questionIndex: number;
  totalQuestions: number;
  userAnswer: string;
  onAnswerChange: (ans: string) => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  questionIndex,
  totalQuestions,
  userAnswer,
  onAnswerChange,
}) => {
  return (
    <div className="bg-slate-900/60 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 relative">
      {/* Header Info */}
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
        <div className="flex items-center space-x-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
            {question.section}
          </span>
          <span className="text-xs text-slate-400 font-semibold font-mono">
            Question {questionIndex + 1} of {totalQuestions}
          </span>
        </div>

        <span className="text-xs font-semibold font-mono px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          1 Mark
        </span>
      </div>

      {/* Question Text */}
      <div className="mb-6">
        <h3 className="text-base sm:text-lg font-semibold text-slate-100 whitespace-pre-wrap leading-relaxed">
          {question.text}
        </h3>
      </div>

      {/* Answer Options */}
      {question.type === "mcq" && question.options ? (
        <div className="space-y-3">
          {question.options.map((opt, idx) => {
            const isSelected = userAnswer === opt;
            const letter = String.fromCharCode(65 + idx); // A, B, C, D

            return (
              <div
                key={idx}
                onClick={() => onAnswerChange(opt)}
                className={`cursor-pointer rounded-xl border p-4 transition-all flex items-center justify-between ${
                  isSelected
                    ? "border-amber-500/80 bg-amber-500/10 text-amber-300 shadow-md ring-1 ring-amber-500/40"
                    : "border-white/10 bg-slate-900/40 text-slate-200 hover:border-white/20 hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold font-mono text-xs ${
                      isSelected
                        ? "bg-amber-500 text-slate-950"
                        : "bg-slate-800 text-slate-400 border border-white/10"
                    }`}
                  >
                    {letter}
                  </span>
                  <span className="text-sm font-medium">{opt}</span>
                </div>

                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    isSelected ? "border-amber-500 bg-amber-500" : "border-white/20"
                  }`}
                >
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Fill-in-the-blank Typing Input */
        <div className="mt-4">
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Edit3 className="w-4 h-4 text-amber-400" />
            Type Your Answer Below:
          </label>
          <input
            type="text"
            placeholder="Type your response here..."
            value={userAnswer || ""}
            onChange={(e) => onAnswerChange(e.target.value)}
            className="w-full p-4 bg-slate-900/80 border border-white/10 rounded-xl text-amber-300 font-mono text-sm focus:outline-none focus:border-amber-500 transition-all shadow-inner"
          />
          <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            Flexible answer checking applied (case, spacing, and numbers like "3" vs "three" handled automatically).
          </p>
        </div>
      )}
    </div>
  );
};
