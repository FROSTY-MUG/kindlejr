import { NextRequest, NextResponse } from "next/server";
import { getFirestore, STUDENTS_COLLECTION } from "../../../lib/firebase";
import { gradeAnswers } from "../../../lib/grading";
import { syncStudentRow } from "../../../lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { studentId, answers } = payload;

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }

    const db = getFirestore();
    const now = new Date();
    const nowIso = now.toISOString();

    let studentData: Record<string, any> = {
      studentId,
      answers: answers || {},
    };

    if (db) {
      const docRef = db.collection(STUDENTS_COLLECTION).doc(studentId);
      const snap = await docRef.get();
      if (snap.exists) {
        studentData = { ...snap.data(), ...studentData };
      }

      // Merge answers if supplied
      if (answers) {
        studentData.answers = { ...(studentData.answers || {}), ...answers };
      }

      const grade = gradeAnswers(studentData.selectedTrack || "c", studentData.answers);

      let timeTakenSeconds = 0;
      let timeTakenFormatted = "-";

      const startTime = studentData.startedAt
        ? new Date(studentData.startedAt).getTime()
        : studentData.registeredAt
        ? new Date(studentData.registeredAt).getTime()
        : null;

      if (startTime) {
        timeTakenSeconds = Math.max(0, Math.floor((now.getTime() - startTime) / 1000));
        const mins = Math.floor(timeTakenSeconds / 60);
        const secs = timeTakenSeconds % 60;
        timeTakenFormatted = `${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
      }

      studentData.isSubmitted = true;
      studentData.totalScore = grade.totalScore;
      studentData.correctCount = grade.correctCount;
      studentData.incorrectCount = grade.incorrectCount;
      studentData.unattemptedCount = grade.unattemptedCount;
      studentData.timeTakenSeconds = timeTakenSeconds;
      studentData.timeTakenFormatted = timeTakenFormatted;
      studentData.submittedAt = nowIso;
      studentData.updatedAt = nowIso;

      await docRef.set(studentData, { merge: true });

      // Live Google Sheets row sync & server-side sort (fire-and-forget)
      syncStudentRow(studentData).catch((err) => {
        console.warn("[SHEETS] Final row sync failed:", err?.message || err);
      });

      return NextResponse.json({
        status: "submitted",
        studentId,
        totalScore: grade.totalScore,
        maxScore: 60,
        correctCount: grade.correctCount,
        incorrectCount: grade.incorrectCount,
        unattemptedCount: grade.unattemptedCount,
        submittedAt: nowIso,
      });
    }

    return NextResponse.json({
      status: "submitted",
      studentId,
      totalScore: 0,
      maxScore: 60,
      correctCount: 0,
      incorrectCount: 0,
      unattemptedCount: 60,
      submittedAt: nowIso,
    });
  } catch (err: any) {
    console.error("[API submit] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
