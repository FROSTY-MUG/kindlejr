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
  strikesCount?: number;
}

export const SubmissionView: React.FC<SubmissionViewProps> = ({
  student,
  score = 0,
  correctCount,
  incorrectCount,
  unattemptedCount,
  totalQuestions = 60,
  strikesCount = 0,
}) => {
  const calcCorrect = correctCount !== undefined ? correctCount : score;
  const calcUnattempted = unattemptedCount !== undefined ? unattemptedCount : 0;
  const calcIncorrect = incorrectCount !== undefined ? incorrectCount : totalQuestions - calcCorrect - calcUnattempted;
  const finalStrikes = strikesCount || student.strikesCount || 0;
  const isDisqualified = finalStrikes >= 2;

  return (
    <div className="max-w-xl mx-auto my-12 px-4">
      <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-slate-200 p-8 text-center relative overflow-hidden">
        {/* Top Decorative Banner */}
        <div
          className={`absolute top-0 left-0 right-0 h-3 bg-gradient-to-r ${
            isDisqualified
              ? "from-rose-600 via-red-600 to-amber-500"
              : "from-blue-600 via-indigo-600 to-emerald-500"
          }`}
        />

        <div
          className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner ring-8 ${
            isDisqualified
              ? "bg-rose-100 text-rose-600 ring-rose-50"
              : "bg-emerald-100 text-emerald-600 ring-emerald-50"
          }`}
        >
          {isDisqualified ? (
            <X className="w-12 h-12" />
          ) : (
            <CheckCircle2 className="w-12 h-12" />
          )}
        </div>

        <h2 className="text-2xl font-black text-slate-800 tracking-tight">
          {isDisqualified ? "Assessment Terminated (Strike 2 Triggered)" : "Assessment Submitted Successfully!"}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          {isDisqualified
            ? "Your assessment was automatically closed and submitted due to multiple proctoring/tab-switching violations."
            : "Thank you for participating in Kindle Jr 5.0. Your response has been securely recorded and synced to the cloud."}
        </p>

        {/* Proctoring Integrity & Strike Notification Line */}
        <div className="my-4">
          {isDisqualified ? (
            <div className="p-3.5 bg-rose-50 border-2 border-rose-400 rounded-2xl text-rose-800 text-xs font-bold flex flex-col items-center gap-1 shadow-sm animate-pulse">
              <span className="text-sm font-black uppercase tracking-wider text-rose-600">
                ⚠️ Proctoring Status: Disqualified (Cheating / Tab Switch Detected)
              </span>
              <span className="text-rose-700">
                Total Strikes Received: <strong className="text-rose-900 font-mono text-sm underline">{finalStrikes} / 2</strong> (Exam auto-submitted on Strike 2)
              </span>
            </div>
          ) : finalStrikes === 1 ? (
            <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-2xl text-amber-800 text-xs font-semibold flex items-center justify-center gap-2">
              <span>⚠️ 1 Proctoring Warning recorded during session.</span>
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700 text-xs font-semibold flex items-center justify-center gap-2">
              <span>🛡️ 0 Proctoring Strikes — 100% Clean Exam Integrity Verified.</span>
            </div>
          )}
        </div>

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
