import { getFallbackQuestions } from "../data/fallbackQuestions";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";

export interface StudentData {
  studentId: string;
  name: string;
  personalEmail: string;
  collegeEmail: string;
  course: string;
  enrollmentNum: string;
  selectedTrack?: string;
  startedAt?: string;
  currentQuestion?: number;
  shuffledOrder?: number[];
  answers?: Record<string, string>;
  isSubmitted?: boolean;
  totalScore?: number;
  correctCount?: number;
  incorrectCount?: number;
  unattemptedCount?: number;
}

export interface Question {
  id: string;
  type: "mcq" | "blank";
  section: string;
  text: string;
  options?: string[];
  answer?: string;
  explanation?: string;
}

export interface AdminLeaderboardEntry {
  rank: number;
  studentId: string;
  name: string;
  collegeEmail: string;
  course: string;
  enrollmentNum: string;
  selectedTrack: string;
  totalScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  timeTakenSeconds?: number;
  timeTakenFormatted?: string;
  isSubmitted: boolean;
}

export async function fetchWithRetry(
  endpoint: string,
  options: RequestInit = {},
  retries = 1,
  backoff = 300
): Promise<Response> {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || AbortSignal.timeout(3000),
    });
    if (!response.ok && retries > 0 && response.status >= 500) {
      throw new Error(`Server status ${response.status}`);
    }
    return response;
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((resolve) => setTimeout(resolve, backoff));
    return fetchWithRetry(endpoint, options, retries - 1, backoff * 2);
  }
}

// Answer Normalization Utility
export function normalizeAnswer(ans: string): string {
  let clean = ans.toLowerCase().trim();
  clean = clean.replace(/[^\w\s]/g, "").trim();

  const numMap: Record<string, string> = {
    zero: "0", one: "1", two: "2", three: "3", four: "4",
    five: "5", six: "6", seven: "7", eight: "8", nine: "9",
    ten: "10",
  };

  return numMap[clean] || clean;
}

// LocalStorage Helper
function getLocalStudent(studentId: string): StudentData | null {
  try {
    const raw = localStorage.getItem(`kindle_student_${studentId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocalStudent(student: StudentData): void {
  try {
    localStorage.setItem(`kindle_student_${student.studentId}`, JSON.stringify(student));
  } catch (e) {
    console.warn("LocalStorage save error:", e);
  }
}

export async function apiRegisterStudent(payload: {
  studentId: string;
  name: string;
  personalEmail: string;
  collegeEmail: string;
  course: string;
  enrollmentNum: string;
}): Promise<void> {
  try {
    const res = await fetchWithRetry("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Server error on register");
  } catch (err) {
    console.warn("[API Fallback] Backend unreachable on /register. Saving student locally:", err);
  } finally {
    const existing = (getLocalStudent(payload.studentId) || {}) as Partial<StudentData>;
    saveLocalStudent({
      studentId: payload.studentId,
      name: payload.name,
      personalEmail: payload.personalEmail,
      collegeEmail: payload.collegeEmail,
      course: payload.course,
      enrollmentNum: payload.enrollmentNum,
      ...existing,
      answers: existing.answers || {},
    });
  }
}

export async function apiInitQuiz(payload: {
  studentId: string;
  selectedTrack: string;
  shuffledOrder: number[];
}): Promise<void> {
  try {
    const res = await fetchWithRetry("/init-quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Server error on init-quiz");
  } catch (err) {
    console.warn("[API Fallback] Backend unreachable on /init-quiz. Setting track locally:", err);
  } finally {
    const existing = getLocalStudent(payload.studentId) || { studentId: payload.studentId, name: "", personalEmail: "", collegeEmail: "", course: "", enrollmentNum: "" };
    saveLocalStudent({
      ...existing,
      selectedTrack: payload.selectedTrack,
      shuffledOrder: payload.shuffledOrder,
      startedAt: existing.startedAt || new Date().toISOString(),
    });
  }
}

export async function apiAutoSaveAnswer(payload: {
  studentId: string;
  questionId?: string;
  answer?: string;
  currentQuestion: number;
  startTimerNow?: boolean;
}): Promise<void> {
  try {
    const res = await fetchWithRetry("/save-answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Server error on save-answer");
  } catch (err) {
    console.warn("[API Fallback] Backend unreachable on /save-answer. Auto-saving answer locally:", err);
  } finally {
    const existing = getLocalStudent(payload.studentId);
    if (existing) {
      const answers = existing.answers || {};
      if (payload.questionId && payload.answer !== undefined) {
        answers[payload.questionId] = payload.answer;
      }
      existing.answers = answers;
      existing.currentQuestion = payload.currentQuestion;
      if (!existing.startedAt && payload.startTimerNow) {
        existing.startedAt = new Date().toISOString();
      }
      saveLocalStudent(existing);
    }
  }
}

export async function apiGetState(studentId: string): Promise<{
  student: StudentData;
  remainingSeconds: number;
  timeExpired: boolean;
}> {
  try {
    const res = await fetchWithRetry(`/state/${encodeURIComponent(studentId)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error("Server status error");
    return await res.json();
  } catch (err) {
    console.warn("[API Fallback] Backend unreachable on /state. Checking local storage:", err);
    const local = getLocalStudent(studentId);
    if (local && local.studentId) {
      const totalExamSeconds = 4200; // 70 mins
      let remainingSeconds = totalExamSeconds;
      let timeExpired = false;

      if (local.startedAt) {
        const start = new Date(local.startedAt).getTime();
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - start) / 1000);
        remainingSeconds = Math.max(0, totalExamSeconds - elapsedSeconds);
        if (remainingSeconds <= 0) timeExpired = true;
      }

      return {
        student: local,
        remainingSeconds,
        timeExpired,
      };
    }
    throw new Error("Student not found locally or on server");
  }
}

export async function apiGetQuestions(track: string): Promise<Question[]> {
  try {
    const res = await fetchWithRetry(`/questions/${encodeURIComponent(track)}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error("Failed to fetch questions from backend");
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    throw new Error("Empty questions returned");
  } catch (err) {
    console.warn(`[API Fallback] Backend unreachable for track ${track}. Loading bundled fallback questions:`, err);
    return getFallbackQuestions(track);
  }
}

export async function apiSubmitQuiz(payload: {
  studentId: string;
  answers?: Record<string, string>;
}): Promise<{
  status: string;
  studentId: string;
  totalScore: number;
  maxScore: number;
  correctCount: number;
  incorrectCount: number;
  unattemptedCount: number;
  submittedAt: string;
}> {
  try {
    const res = await fetchWithRetry("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to submit quiz to backend");
    return await res.json();
  } catch (err) {
    console.warn("[API Fallback] Backend unreachable on /submit. Evaluating submission locally:", err);
    const student = getLocalStudent(payload.studentId);
    const answers = { ...(student?.answers || {}), ...(payload.answers || {}) };
    const track = student?.selectedTrack || "C";
    const allQuestions = getFallbackQuestions(track);

    let correctCount = 0;
    let incorrectCount = 0;
    let unattemptedCount = 0;

    for (const q of allQuestions) {
      const userAns = answers[q.id];
      if (!userAns || userAns.trim() === "") {
        unattemptedCount++;
      } else if (q.answer && normalizeAnswer(userAns) === normalizeAnswer(q.answer)) {
        correctCount++;
      } else {
        incorrectCount++;
      }
    }

    const totalScore = correctCount;
    const now = new Date().toISOString();

    if (student) {
      saveLocalStudent({
        ...student,
        answers,
        isSubmitted: true,
        totalScore,
        correctCount,
        incorrectCount,
        unattemptedCount,
      });
    }

    return {
      status: "submitted",
      studentId: payload.studentId,
      totalScore,
      maxScore: 60,
      correctCount,
      incorrectCount,
      unattemptedCount,
      submittedAt: now,
    };
  }
}

// Admin Leaderboard Fetch (polling endpoint)
export async function apiGetAdminLeaderboard(adminKey: string): Promise<{
  totalStudents: number;
  students: AdminLeaderboardEntry[];
}> {
  try {
    const res = await fetchWithRetry("/admin/leaderboard", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey,
      },
    });
    if (!res.ok) throw new Error("Leaderboard fetch failed");
    return await res.json();
  } catch (err) {
    console.warn("[Admin API Fallback] Backend unreachable for admin leaderboard. Building local leaderboard:", err);
    
    // Collect all local students stored in localStorage
    const students: AdminLeaderboardEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("kindle_student_")) {
        try {
          const st = JSON.parse(localStorage.getItem(key) || "{}") as StudentData;
          if (st.studentId) {
            students.push({
              rank: 0,
              studentId: st.studentId,
              name: st.name || "Unknown",
              collegeEmail: st.collegeEmail || "N/A",
              course: st.course || "B.Tech CSE",
              enrollmentNum: st.enrollmentNum || "N/A",
              selectedTrack: st.selectedTrack || "C",
              totalScore: st.totalScore || 0,
              correctCount: st.correctCount || 0,
              incorrectCount: st.incorrectCount || 0,
              unattemptedCount: st.unattemptedCount || 60,
              isSubmitted: !!st.isSubmitted,
            });
          }
        } catch {}
      }
    }

    // Sort descending by totalScore
    students.sort((a, b) => b.totalScore - a.totalScore);
    students.forEach((s, idx) => (s.rank = idx + 1));

    return {
      totalStudents: students.length,
      students,
    };
  }
}

// Admin Bulk Export to Google Sheets
export async function apiTriggerBulkExport(adminKey: string): Promise<{
  status: string;
  studentsCount: number;
  message: string;
}> {
  const res = await fetchWithRetry("/admin/export-sheets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": adminKey,
    },
  });
  if (!res.ok) throw new Error("Bulk export failed");
  return await res.json();
}
