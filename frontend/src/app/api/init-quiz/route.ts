import { NextRequest, NextResponse } from "next/server";
import { getFirestore, STUDENTS_COLLECTION } from "../../../lib/firebase";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { studentId, selectedTrack, shuffledOrder } = payload;

    if (!studentId || !selectedTrack) {
      return NextResponse.json(
        { error: "studentId and selectedTrack are required" },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const now = new Date().toISOString();

    if (db) {
      const docRef = db.collection(STUDENTS_COLLECTION).doc(studentId);
      await docRef.set(
        {
          studentId,
          selectedTrack,
          shuffledOrder: shuffledOrder || [],
          updatedAt: now,
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      status: "success",
      studentId,
      selectedTrack,
    });
  } catch (err: any) {
    console.error("[API init-quiz] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
