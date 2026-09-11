import { NextRequest, NextResponse } from "next/server";
import { getFirestore, STUDENTS_COLLECTION } from "../../../../lib/firebase";

const EXAM_DURATION_SECONDS = 3600; // 60 minutes

export async function GET(
  req: NextRequest,
  { params }: { params: { studentId: string } }
) {
  try {
    const studentId = params.studentId;
    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }

    const db = getFirestore();
    if (!db) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const doc = await db.collection(STUDENTS_COLLECTION).doc(studentId).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    const student = doc.data() as any;
    let remainingSeconds = EXAM_DURATION_SECONDS;
    let timeExpired = false;
    let disconnectedSeconds = 0;
    let bufferExpired = false;
    let shouldAutoSubmit = false;

    const now = Date.now();

    if (student.startedAt) {
      const started = new Date(student.startedAt).getTime();
      const elapsed = Math.floor((now - started) / 1000);
      remainingSeconds = Math.max(0, EXAM_DURATION_SECONDS - elapsed);

      if (student.updatedAt) {
        const lastUpdated = new Date(student.updatedAt).getTime();
        disconnectedSeconds = Math.max(0, Math.floor((now - lastUpdated) / 1000));
        // 15-minute buffer check (900 seconds)
        if (disconnectedSeconds > 900 && !student.isSubmitted) {
          bufferExpired = true;
        }
      }

      if (remainingSeconds <= 0) {
        timeExpired = true;
      }

      // If time remaining is <= 30 seconds or 15m reconnection buffer expired
      if (timeExpired || remainingSeconds <= 30 || bufferExpired) {
        shouldAutoSubmit = true;
      }
    }

    return NextResponse.json({
      student,
      remainingSeconds,
      timeExpired,
      disconnectedSeconds,
      bufferExpired,
      shouldAutoSubmit,
    });
  } catch (err: any) {
    console.error("[API state] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
