import { NextRequest, NextResponse } from "next/server";
import { getFirestore, STUDENTS_COLLECTION } from "../../../lib/firebase";
import { gradeAnswers } from "../../../lib/grading";
import { syncStudentRow } from "../../../lib/sheets";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { studentId, questionId, answer, currentQuestion, startTimerNow, violationCount } = payload;

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }

    const db = getFirestore();
    const now = new Date().toISOString();

    let studentData: Record<string, any> = {
      studentId,
      answers: {},
      currentQuestion: currentQuestion || 0,
      updatedAt: now,
    };

    if (db) {
      const docRef = db.collection(STUDENTS_COLLECTION).doc(studentId);
      const snap = await docRef.get();
      if (snap.exists) {
        studentData = { ...snap.data(), ...studentData };
      }

      if (violationCount !== undefined) {
        const vNum = Number(violationCount) || 0;
        studentData.violationCount = Math.max(studentData.violationCount || 0, vNum);
        studentData.strikesCount = studentData.violationCount;
        if (studentData.violationCount >= 2) {
          studentData.cheated = true;
        }
      }

      if (!studentData.answers) studentData.answers = {};

      if (questionId) {
        studentData.answers[questionId] = answer;
      }

      if (startTimerNow && !studentData.startedAt) {
        studentData.startedAt = now;
      }

      // Real-time partial grading
      const grade = gradeAnswers(studentData.selectedTrack || "c", studentData.answers);
      studentData.totalScore = grade.totalScore;
      studentData.correctCount = grade.correctCount;
      studentData.incorrectCount = grade.incorrectCount;
      studentData.unattemptedCount = grade.unattemptedCount;

      await docRef.set(studentData, { merge: true });

      // Dual-write to Google Sheets asynchronously without blocking request
      syncStudentRow(studentData).catch((err) => {
        console.warn("[SHEETS] Background sync failed:", err?.message || err);
      });

      return NextResponse.json({
        status: "success",
        studentId,
        realtimeScore: grade.totalScore,
        correctCount: grade.correctCount,
        incorrectCount: grade.incorrectCount,
        unattemptedCount: grade.unattemptedCount,
      });
    }

    return NextResponse.json({ status: "success", studentId });
  } catch (err: any) {
    console.error("[API save-answer] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
