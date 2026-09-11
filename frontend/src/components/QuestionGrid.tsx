import React from "react";
import { Question } from "../services/api";

interface QuestionGridProps {
  questions: Question[];
  shuffledOrder: number[];
  currentIndex: number;
  answers: Record<string, string>;
  onSelectIndex: (idx: number) => void;
}

export const QuestionGrid: React.FC<QuestionGridProps> = ({
  questions,
  shuffledOrder,
  currentIndex,
  answers,
  onSelectIndex,
}) => {
  return (
    <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-5">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
        <span>Question Palette (60)</span>
        <span className="text-slate-400 font-normal">Click to Jump</span>
      </h4>

      {/* Grid Palette */}
      <div className="grid grid-cols-6 sm:grid-cols-10 gap-2 max-h-64 overflow-y-auto p-1">
        {shuffledOrder.map((qOriginalIndex, gridPosIndex) => {
          const question = questions[qOriginalIndex];
          if (!question) return null;

          const isCurrent = gridPosIndex === currentIndex;
          const hasAnswered =
            answers[question.id] !== undefined &&
            answers[question.id].trim() !== "";

          let bgClass = "bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200";
          if (hasAnswered) {
            bgClass = "bg-emerald-500 text-white font-bold border-emerald-600 hover:bg-emerald-600";
          }
          if (isCurrent) {
            bgClass += " ring-2 ring-blue-600 ring-offset-2 scale-105 z-10";
          }

          return (
            <button
              key={gridPosIndex}
              onClick={() => onSelectIndex(gridPosIndex)}
              className={`w-9 h-9 rounded-xl border text-xs font-semibold flex items-center justify-center transition-all ${bgClass}`}
            >
              {gridPosIndex + 1}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-around text-[11px] text-slate-600">
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-md bg-emerald-500 inline-block" />
          <span>Answered</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-md bg-slate-200 border border-slate-300 inline-block" />
          <span>Unanswered</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="w-3 h-3 rounded-md bg-white border-2 border-blue-600 inline-block" />
          <span>Current</span>
        </div>
      </div>
    </div>
  );
};
