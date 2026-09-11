import React from "react";
import { Question } from "../services/api";

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
  const options = question.options || [];

  return (
    <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-8 relative transition-all">
      {/* Header Info */}
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <span className="px-3.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
            {question.section || "Technical MCQ"}
          </span>
          <span className="text-xs text-slate-500 font-bold font-mono">
            Question {questionIndex + 1} of {totalQuestions}
          </span>
        </div>

        <span className="text-xs font-bold font-mono px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
          +1.0 Mark
        </span>
      </div>

      {/* Question Text */}
      <div className="mb-8">
        <h3 className="text-base sm:text-lg font-bold text-slate-800 whitespace-pre-wrap leading-relaxed tracking-tight">
          {question.text}
        </h3>
      </div>

      {/* MCQ Answer Options */}
      <div className="space-y-3.5">
        {options.map((opt, idx) => {
          const letter = String.fromCharCode(65 + idx); // A, B, C, D
          const isSelected =
            userAnswer === opt ||
            userAnswer.toLowerCase() === letter.toLowerCase();

          return (
            <div
              key={idx}
              onClick={() => onAnswerChange(opt)}
              className={`cursor-pointer rounded-xl border-2 p-4 sm:p-5 transition-all flex items-center justify-between select-none ${
                isSelected
                  ? "border-blue-600 bg-blue-50/80 text-slate-800 shadow-md ring-2 ring-blue-600/20 font-semibold"
                  : "border-slate-200 bg-slate-50/60 text-slate-700 hover:border-blue-300 hover:bg-slate-100/80 font-medium"
              }`}
            >
              <div className="flex items-center space-x-3.5">
                <span
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-black font-mono text-xs transition-all ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-sm"
                      : "bg-white text-slate-600 border border-slate-200"
                  }`}
                >
                  {letter}
                </span>
                <span className="text-sm sm:text-base leading-snug">{opt}</span>
              </div>

              {/* Radio Indicator */}
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                  isSelected
                    ? "border-blue-600 bg-blue-600"
                    : "border-slate-300 bg-white"
                }`}
              >
                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
