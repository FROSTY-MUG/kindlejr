import React from "react";
import { CheckCircle2, Award, FileSpreadsheet, Check, X, HelpCircle } from "lucide-react";
import { StudentData } from "../services/api";

interface SubmissionViewProps {
  student: StudentData;
  score?: number;
  correctCount?: number;
  incorrectCount?: number;
  unattemptedCount?: number;
  totalQuestions?: number;
}

export const SubmissionView: React.FC<SubmissionViewProps> = ({
  student,
  score = 0,
  correctCount,
  incorrectCount,
  unattemptedCount,
  totalQuestions = 60,
}) => {
  const calcCorrect = correctCount !== undefined ? correctCount : score;
  const calcUnattempted = unattemptedCount !== undefined ? unattemptedCount : 0;
  const calcIncorrect = incorrectCount !== undefined ? incorrectCount : totalQuestions - calcCorrect - calcUnattempted;

  return (
    <div className="max-w-xl mx-auto my-12 px-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-8 text-center relative overflow-hidden">
        {/* Top Decorative Banner */}
        <div className="absolute top-0 left-0 right-0 h-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-500" />

        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ring-8 ring-emerald-50">
          <CheckCircle2 className="w-12 h-12" />
        </div>

        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Assessment Submitted Successfully!
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Thank you for participating in <strong className="text-slate-800">Kindle Jr 5.0</strong>. Your response has been securely recorded and synced to the cloud.
        </p>

        {/* Score Card */}
        <div className="my-6 bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-2xl p-6 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-700 uppercase tracking-widest mb-1">
            <Award className="w-4 h-4 text-amber-500" /> Final Score
          </div>
          <div className="text-5xl font-black text-slate-900 tracking-tight">
            {score} <span className="text-lg font-bold text-slate-400">/ {totalQuestions}</span>
          </div>

          {/* Breakdown Grid */}
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-200 text-xs">
            <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200">
              <div className="flex items-center justify-center gap-1 text-emerald-700 font-bold mb-0.5">
                <Check className="w-3.5 h-3.5" /> Correct
              </div>
              <div className="text-lg font-extrabold text-emerald-800">{calcCorrect}</div>
            </div>

            <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-200">
              <div className="flex items-center justify-center gap-1 text-rose-700 font-bold mb-0.5">
                <X className="w-3.5 h-3.5" /> Incorrect
              </div>
              <div className="text-lg font-extrabold text-rose-800">{calcIncorrect}</div>
            </div>

            <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
              <div className="flex items-center justify-center gap-1 text-slate-600 font-bold mb-0.5">
                <HelpCircle className="w-3.5 h-3.5" /> Unattempted
              </div>
              <div className="text-lg font-extrabold text-slate-700">{calcUnattempted}</div>
            </div>
          </div>
        </div>

        {/* Student Summary Details */}
        <div className="text-left bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2 mb-6">
          <div className="flex justify-between">
            <span className="text-slate-500">Student Name:</span>
            <span className="font-semibold text-slate-800">{student.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Student ID:</span>
            <span className="font-mono font-semibold text-slate-800">{student.studentId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">College Email:</span>
            <span className="font-semibold text-slate-800">{student.collegeEmail}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Selected Track:</span>
            <span className="font-bold text-blue-700">{student.selectedTrack}</span>
          </div>
        </div>

        {/* Google Sheets Export Verification Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-medium">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Synced & Auto-Sorted on Master Leaderboard</span>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 text-[11px] text-slate-400">
          IEEE Graphic Era Student Branch • Kindle Jr 5.0
        </div>
      </div>
    </div>
  );
};
