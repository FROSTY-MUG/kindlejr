import { NextRequest, NextResponse } from "next/server";
import { getFirestore, STUDENTS_COLLECTION } from "../../../lib/firebase";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { studentId, name, personalEmail, collegeEmail, course, enrollmentNum } = payload;

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }

    const db = getFirestore();
    const now = new Date().toISOString();

    const data: Record<string, any> = {
      studentId,
      name: name || "",
      personalEmail: personalEmail || "",
      collegeEmail: collegeEmail || "",
      course: course || "",
      enrollmentNum: enrollmentNum || "",
      updatedAt: now,
    };

    if (db) {
      const docRef = db.collection(STUDENTS_COLLECTION).doc(studentId);
      const existing = await docRef.get();
      if (!existing.exists || !existing.data()?.registeredAt) {
        data.registeredAt = now;
      }
      await docRef.set(data, { merge: true });
    }

    return NextResponse.json({ status: "success", studentId });
  } catch (err: any) {
    console.error("[API register] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
