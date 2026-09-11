import { NextRequest, NextResponse } from "next/server";
import { getFirestore, STUDENTS_COLLECTION } from "../../../../lib/firebase";

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const { studentId, name, personalEmail, collegeEmail, course, enrollmentNum } = payload;

    if (!studentId) {
      return NextResponse.json({ error: "studentId is required" }, { status: 400 });
    }

    const db = getFirestore();
    const now = new Date().toISOString();

    if (db) {
      await db.collection(STUDENTS_COLLECTION).doc(studentId).set(
        {
          studentId,
          name: name || "",
          personalEmail: personalEmail || "",
          collegeEmail: collegeEmail || "",
          course: course || "",
          enrollmentNum: enrollmentNum || "",
          updatedAt: now,
          source: "google_form",
        },
        { merge: true }
      );
    }

    return NextResponse.json({
      status: "success",
      message: "Student pre-registration ingested successfully from Google Form",
      studentId,
    });
  } catch (err: any) {
    console.error("[API webhook/google-forms] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
