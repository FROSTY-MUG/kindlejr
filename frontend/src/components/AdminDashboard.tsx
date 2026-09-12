import React, { useEffect, useState, useCallback } from "react";
import {
  Users,
  BarChart2,
  RefreshCw,
  FileSpreadsheet,
  LogOut,
  Trophy,
  Activity,
  CheckCircle2,
  ExternalLink,
  Download,
} from "lucide-react";
import {
  apiGetAdminLeaderboard,
  apiSyncSheets,
  AdminLeaderboardEntry,
} from "../services/api";

interface AdminDashboardProps {
  onExit: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onExit }) => {
  const [leaderboard, setLeaderboard] = useState<AdminLeaderboardEntry[]>([]);
  const [totalStudents, setTotalStudents] = useState<number>(0);
  const [avgScore, setAvgScore] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportMessage, setExportMessage] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [persistenceMode, setPersistenceMode] = useState<string>("unknown");

  // The key must match the backend's ADMIN_SECRET exactly. It is injected at
  // build time via NEXT_PUBLIC_ADMIN_SECRET; the literal fallback mirrors the
  // value in backend/.env so a default local run works out of the box.
  const adminSecretKey =
    process.env.NEXT_PUBLIC_ADMIN_SECRET || "kindle_jr_5_admin_secret_2026";

  // Fetch telemetry & leaderboard data
  const fetchTelemetry = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const data = await apiGetAdminLeaderboard(adminSecretKey);
      setLeaderboard(data.students || []);
      setTotalStudents(data.totalStudents || (data.students ? data.students.length : 0));

      // Prefer the server-computed average (submitted students only).
      if (typeof data.averageScore === "number") {
        setAvgScore(Number(data.averageScore.toFixed(1)));
      } else if (data.students && data.students.length > 0) {
        const sum = data.students.reduce((acc, curr) => acc + curr.totalScore, 0);
        setAvgScore(Number((sum / data.students.length).toFixed(1)));
      } else {
        setAvgScore(0);
      }

      setPersistenceMode(data.persistenceMode || "unknown");
      setIsConnected(true);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      console.warn("Failed to fetch admin telemetry:", err);
      setIsConnected(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [adminSecretKey]);

  // Initial fetch plus a 5-second polling loop that pauses while the tab is
  // hidden. Polling a background tab wastes backend CPU and holds the
  // connection pool open for no visible benefit.
  useEffect(() => {
    fetchTelemetry();

    let interval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (interval) return;
      interval = setInterval(fetchTelemetry, 5000);
    };

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchTelemetry();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchTelemetry]);

  // Sync leaderboard to Google Sheets live.
  const handleSyncSheets = async () => {
    setIsExporting(true);
    setExportMessage("");
    try {
      await apiSyncSheets(adminSecretKey);
      setExportMessage(
        `Successfully synced ${totalStudents} student record(s) to Google Sheets leaderboard.`
      );
    } catch (err) {
      console.warn("Sheets sync failed:", err);
      setExportMessage("Google Sheets sync failed. Check backend credentials.");
    } finally {
      setIsExporting(false);
      setTimeout(() => setExportMessage(""), 5000);
    }
  };

  const handleDownloadExcel = () => {
    if (leaderboard.length === 0) return;
    const headers = ["Rank", "Name", "Student ID", "College Email", "Enrollment", "Course", "Track", "Strikes", "Correct", "Incorrect", "Unattempted", "Time Taken", "Score", "Cheated"];
    const rows = leaderboard.map((s, idx) => [
      idx + 1,
      s.name || "Unknown",
      s.studentId,
      s.collegeEmail || "N/A",
      s.enrollmentNum || "N/A",
      s.courseSelection === "Other" ? s.customCourse || "Other" : s.courseSelection || "N/A",
      s.track || "N/A",
      s.strikesCount || 0,
      s.correctCount || 0,
      s.incorrectCount || 0,
      s.unattemptedCount || 0,
      s.timeTakenFormatted || "-",
      s.totalScore || 0,
      s.cheated ? "YES" : "NO"
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leaderboard");
    XLSX.writeFile(workbook, `KindleJr_Leaderboard_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900 font-sans selection:bg-blue-200 selection:text-blue-900 pt-20 pb-16">
      {/* Fixed Top Bar Header */}
      <header className="fixed top-0 left-0 w-full z-50 bg-white/90 backdrop-blur-xl border-b-2 border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-4">
          <img src="/image_da2c44.png" alt="Graphic Era | IEEE SB" className="h-14 w-auto object-contain" />
          <div className="h-6 w-[2px] bg-slate-200" />
          <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 flex items-center gap-2">
            <span className="text-blue-600 font-extrabold">Kindle Jr 5.0</span>
            <span className="text-slate-500 font-medium">— Live Leaderboard Telemetry</span>
          </h1>
        </div>

        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 text-sm font-mono font-bold text-emerald-600 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>LIVE</span>
          </div>

          <button
            onClick={onExit}
            className="py-2 px-4 rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border-2 border-slate-200 transition-all flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Exit Portal
          </button>
        </div>
      </header>

      {/* Main Content Dashboard Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Metric Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Card 1: Registered Students */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-8 shadow-md flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-widest font-bold text-slate-500 mb-2">
                Registered Candidates
              </p>
              <h3 className="font-mono text-4xl sm:text-5xl font-black text-slate-900">
                {totalStudents}
              </h3>
              <p className="text-xs font-semibold text-blue-600 mt-2 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Synchronized in real-time
              </p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border-2 border-blue-100 flex items-center justify-center text-blue-600">
              <Users className="w-8 h-8" />
            </div>
          </div>

          {/* Card 2: Average Score */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-8 shadow-md flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-widest font-bold text-slate-500 mb-2">
                Mean Exam Score
              </p>
              <h3 className="font-mono text-4xl sm:text-5xl font-black text-emerald-600">
                {avgScore} <span className="text-lg text-slate-400 font-sans font-bold">/ 60</span>
              </h3>
              <p className="text-xs font-semibold text-slate-400 mt-2 uppercase tracking-wide">Real-time Class Mean</p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center text-emerald-600">
              <BarChart2 className="w-8 h-8" />
            </div>
          </div>

          {/* Card 3: System Status & Sheets Sync */}
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-8 shadow-md flex flex-col justify-between space-y-4">
            <div>
              <p className="text-sm uppercase tracking-widest font-bold text-slate-500 mb-2">
                System Health
              </p>
              <div className="flex items-center space-x-3 mt-2">
                <span
                  className={`w-3 h-3 rounded-full ${isConnected ? "bg-emerald-500 animate-ping" : "bg-rose-500"
                    }`}
                />
                <span className="font-mono text-xl font-black text-slate-800">
                  {isConnected ? "Operational" : "Disconnected"}
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500 mt-3">
                Persistence:{" "}
                <span
                  className={
                    persistenceMode === "firestore"
                      ? "text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 ml-1"
                      : "text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-200 ml-1"
                  }
                >
                  {persistenceMode === "firestore" ? "Cloud Firestore" : persistenceMode}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                onClick={handleSyncSheets}
                disabled={isExporting}
                className="py-2 px-3 bg-pink-500 hover:bg-pink-600 text-white text-xs font-bold rounded-xl shadow border border-pink-400 flex items-center gap-1.5 transition-all disabled:opacity-50"
                title="Sync to Google Sheets API v4"
              >
                {isExporting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                )}
                Sync Sheets
              </button>

              <button
                onClick={handleDownloadExcel}
                className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow border border-emerald-500 flex items-center gap-1.5 transition-all"
                title="Download Leaderboard as Excel"
              >
                <Download className="w-3.5 h-3.5" />
                Export Excel
              </button>

              <a
                href="https://1drv.ms/x/c/14bf62685276b99c/IQBuDIUkJ4NRRLrqEbM4yFKjAQ0hKpdxsOMIBA1IgoQ8Lwk?e=biLM3s"
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow border border-blue-500 flex items-center gap-1.5 transition-all"
                title="Open kindlr jr 5.0 prod.xlsx in Excel Online"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                OneDrive Excel
              </a>
            </div>
          </div>
        </div>

        {exportMessage && (
          <div className="mb-6 p-4 rounded-xl bg-blue-50 border-2 border-blue-200 text-blue-800 text-sm font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
            {exportMessage}
          </div>
        )}

        {/* Live Leaderboard Section */}
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b-2 border-slate-200 gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                <Trophy className="w-7 h-7 text-amber-500" /> Live Assessment Leaderboard
              </h2>
              <p className="text-xs text-slate-500 mt-1 font-semibold">
                Sorted strictly by <strong className="text-blue-600">Total Score (DESC)</strong> $\rightarrow$ <strong className="text-blue-600">Time Taken (ASC)</strong>.
              </p>
            </div>

            <div className="flex items-center space-x-4 text-sm font-bold text-slate-500">
              <span className="flex items-center gap-2 font-mono bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                <Activity className={`w-4 h-4 text-blue-500 ${isRefreshing ? "animate-spin" : ""}`} />
                Updated {lastUpdated || "Just now"}
              </span>

              <button
                onClick={fetchTelemetry}
                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 border-2 border-slate-200 transition-colors"
                title="Refresh Leaderboard"
              >
                <RefreshCw className={`w-5 h-5 ${isRefreshing ? "animate-spin text-blue-600" : ""}`} />
              </button>
            </div>
          </div>

          {/* Scoreboard Table */}
          <div className="overflow-x-auto rounded-xl border-2 border-slate-200 mt-6">
            <table className="w-full text-sm text-left text-slate-700">
              <thead className="text-xs font-bold uppercase tracking-wider text-slate-600 bg-slate-100 border-b-2 border-slate-200 font-mono">
                <tr>
                  <th className="py-3.5 px-4 text-center">Rank</th>
                  <th className="py-3.5 px-4">Full Name</th>
                  <th className="py-3.5 px-4">Student ID</th>
                  <th className="py-3.5 px-4">College Email</th>
                  <th className="py-3.5 px-4">Enrollment</th>
                  <th className="py-3.5 px-4">Course</th>
                  <th className="py-3.5 px-3 text-center">Track</th>
                  <th className="py-3.5 px-3 text-center">Strikes</th>
                  <th className="py-3.5 px-3 text-center">Correct</th>
                  <th className="py-3.5 px-3 text-center">Incorrect</th>
                  <th className="py-3.5 px-3 text-center">Unattempted</th>
                  <th className="py-3.5 px-4 text-center">Time Taken</th>
                  <th className="py-3.5 px-4 text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-slate-100 font-sans font-medium text-xs sm:text-sm">
                {leaderboard.length > 0 ? (
                  leaderboard.map((student) => {
                    const isTop1 = student.rank === 1;
                    const isTop2 = student.rank === 2;
                    const isTop3 = student.rank === 3;
                    const strikes = student.strikesCount || 0;
                    const isDisqualified = !!(student.cheated || strikes >= 2);

                    return (
                      <tr
                        key={student.studentId}
                        className={`transition-colors hover:bg-slate-50 ${
                          isDisqualified
                            ? "bg-rose-50/60 border-l-4 border-l-rose-500"
                            : isTop1
                            ? "bg-amber-50/50 border-l-4 border-l-amber-500"
                            : isTop2
                            ? "bg-slate-100/50 border-l-4 border-l-slate-400"
                            : isTop3
                            ? "bg-amber-100/30 border-l-4 border-l-amber-700"
                            : ""
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-3.5 px-4 text-center font-mono font-black text-base">
                          {isTop1 ? (
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-300 rounded-lg">
                              🥇 #1
                            </span>
                          ) : isTop2 ? (
                            <span className="px-2.5 py-0.5 bg-slate-200 text-slate-700 border border-slate-300 rounded-lg">
                              🥈 #2
                            </span>
                          ) : isTop3 ? (
                            <span className="px-2.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-300 rounded-lg">
                              🥉 #3
                            </span>
                          ) : (
                            <span className="text-slate-500">#{student.rank}</span>
                          )}
                        </td>

                        {/* Full Name */}
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span>{student.name}</span>
                            {isDisqualified && (
                              <span className="text-[10px] uppercase font-black px-1.5 py-0.5 bg-rose-600 text-white border border-rose-700 rounded animate-pulse shadow-sm">
                                CHEATED
                              </span>
                            )}
                            {student.isSubmitted ? (
                              <span className="text-[10px] uppercase font-black px-1.5 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-300 rounded">
                                Submitted
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded">
                                Active
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Student ID */}
                        <td className="py-3.5 px-4 font-mono text-blue-600 font-bold">
                          {student.studentId}
                        </td>

                        {/* College Email */}
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                          {student.collegeEmail || "-"}
                        </td>

                        {/* Enrollment Number */}
                        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-700">
                          {student.enrollmentNum || "-"}
                        </td>

                        {/* Course */}
                        <td className="py-3.5 px-4 text-xs text-slate-600 font-semibold">{student.course}</td>

                        {/* Track */}
                        <td className="py-3.5 px-3 text-center font-bold text-xs">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
                            {student.selectedTrack || "-"}
                          </span>
                        </td>

                        {/* Strikes */}
                        <td className="py-3.5 px-3 text-center">
                          {isDisqualified ? (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-700 font-bold text-xs rounded border border-rose-300" title="Disqualified on Strike 2">
                              ⛔ 2 (Cheated)
                            </span>
                          ) : strikes === 1 ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold text-xs rounded border border-amber-300" title="1 Warning">
                              ⚠️ 1
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold text-xs rounded border border-emerald-200">
                              ✓ 0
                            </span>
                          )}
                        </td>

                        {/* Correct Count */}
                        <td className="py-3.5 px-3 text-center font-mono font-black text-emerald-600">
                          {student.correctCount}
                        </td>

                        {/* Incorrect Count */}
                        <td className="py-3.5 px-3 text-center font-mono font-black text-rose-600">
                          {student.incorrectCount}
                        </td>

                        {/* Unattempted Count */}
                        <td className="py-3.5 px-3 text-center font-mono font-bold text-slate-400">
                          {student.unattemptedCount}
                        </td>

                        {/* Time Taken */}
                        <td className="py-3.5 px-4 text-center font-mono text-xs text-blue-600 font-bold">
                          {student.timeTakenFormatted || "-"}
                        </td>

                        {/* Total Score / Marks */}
                        <td className="py-3.5 px-4 text-right font-mono text-lg font-black text-slate-900">
                          {student.totalScore}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={13} className="py-12 text-center text-slate-500 font-mono font-bold text-sm bg-slate-50">
                      No active telemetry data available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
