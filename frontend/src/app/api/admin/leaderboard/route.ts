export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { getFirestore, STUDENTS_COLLECTION } from "../../../../lib/firebase";

function checkAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.NEXT_PUBLIC_ADMIN_SECRET || "kindle_jr_5_admin_secret_2026";
  const provided = req.headers.get("x-admin-key") || req.nextUrl.searchParams.get("key");
  return provided === secret;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getFirestore();
    if (!db) {
      return NextResponse.json({
        totalStudents: 0,
        submittedCount: 0,
        averageScore: 0,
        lastUpdated: new Date().toISOString(),
        persistenceMode: "offline",
        students: [],
      });
    }

    const snapshot = await db.collection(STUDENTS_COLLECTION).get();
    const students: any[] = [];

    const now = new Date().getTime();
    snapshot.forEach((doc: any) => {
      const data = doc.data();
      let timeSecs = data.timeTakenSeconds || 0;
      let timeFmt = data.timeTakenFormatted || "-";

      if (!data.isSubmitted && timeSecs === 0) {
        const start = data.startedAt ? new Date(data.startedAt).getTime() : (data.registeredAt ? new Date(data.registeredAt).getTime() : 0);
        if (start > 0) {
          timeSecs = Math.max(0, Math.floor((now - start) / 1000));
          const m = Math.floor(timeSecs / 60);
          const s = timeSecs % 60;
          timeFmt = `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
        }
      }
      data.timeTakenSeconds = timeSecs;
      data.timeTakenFormatted = timeFmt;
      students.push(data);
    });

    // Dual-sort: Total Score (DESC), then Time Taken (ASC - least time taken wins)
    students.sort((a, b) => {
      const scoreA = a.totalScore || 0;
      const scoreB = b.totalScore || 0;
      if (scoreA !== scoreB) return scoreB - scoreA;

      const timeA = a.timeTakenSeconds || 0;
      const timeB = b.timeTakenSeconds || 0;
      if (timeA > 0 && timeB > 0 && timeA !== timeB) return timeA - timeB;
      if (timeA > 0 && timeB <= 0) return -1;
      if (timeB > 0 && timeA <= 0) return 1;

      return (b.correctCount || 0) - (a.correctCount || 0);
    });

    let submittedCount = 0;
    let scoreSum = 0;
    let lastUpdated = "";

    const ranked = students.map((s, idx) => {
      if (s.isSubmitted) {
        submittedCount++;
        scoreSum += s.totalScore || 0;
      }
      if (s.updatedAt && s.updatedAt > lastUpdated) {
        lastUpdated = s.updatedAt;
      }

      return {
        rank: idx + 1,
        studentId: s.studentId,
        name: s.name || "",
        collegeEmail: s.collegeEmail || "",
        course: s.course || "",
        enrollmentNum: s.enrollmentNum || "",
        selectedTrack: s.selectedTrack || "-",
        totalScore: s.totalScore || 0,
        correctCount: s.correctCount || 0,
        incorrectCount: s.incorrectCount || 0,
        unattemptedCount: s.unattemptedCount ?? 60,
        timeTakenSeconds: s.timeTakenSeconds || 0,
        timeTakenFormatted: s.timeTakenFormatted || "-",
        isSubmitted: !!s.isSubmitted,
        registeredAt: s.registeredAt || "",
        strikesCount: s.strikesCount || 0,
        cheated: !!(s.cheated || (s.strikesCount && s.strikesCount >= 2)),
      };
    });

    const averageScore = submittedCount > 0 ? Number((scoreSum / submittedCount).toFixed(1)) : 0;

    return NextResponse.json({
      totalStudents: ranked.length,
      submittedCount,
      averageScore,
      lastUpdated: lastUpdated || new Date().toISOString(),
      persistenceMode: "firestore",
      students: ranked,
    });
  } catch (err: any) {
    console.error("[API admin/leaderboard] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
