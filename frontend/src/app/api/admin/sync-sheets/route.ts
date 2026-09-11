import { NextRequest, NextResponse } from "next/server";
import { getFirestore, STUDENTS_COLLECTION } from "../../../../lib/firebase";
import {
  ensureHeaders,
  getSheetName,
  getSpreadsheetId,
  sortLeaderboardRange,
} from "../../../../lib/sheets";
import { google } from "googleapis";

function checkAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.NEXT_PUBLIC_ADMIN_SECRET || "kindle_jr_5_admin_secret_2026";
  const provided = req.headers.get("x-admin-key") || req.nextUrl.searchParams.get("key");
  return provided === secret;
}

function getCredentials(): any | null {
  for (const key of [
    "GOOGLE_SHEETS_CREDENTIALS_BASE64",
    "GOOGLE_SERVICE_ACCOUNT_BASE64",
    "FIREBASE_CREDENTIALS_BASE64",
  ]) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    if (raw.startsWith("{")) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    try {
      return JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    } catch {}
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getFirestore();
    const spreadsheetId = getSpreadsheetId();
    const sheetName = getSheetName();

    if (!spreadsheetId) {
      return NextResponse.json({ error: "Spreadsheet ID not configured" }, { status: 500 });
    }

    const creds = getCredentials();
    if (!creds) {
      return NextResponse.json({ error: "No Google Sheets credentials found" }, { status: 500 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: creds.client_email,
        private_key: creds.private_key,
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    await ensureHeaders(spreadsheetId, sheetName);

    let students: any[] = [];
    if (db) {
      const snap = await db.collection(STUDENTS_COLLECTION).get();
      snap.forEach((doc: any) => students.push(doc.data()));
    }

    // Sort students: Total Score DESC, then Time Taken ASC
    students.sort((a, b) => {
      const scoreA = a.totalScore || 0;
      const scoreB = b.totalScore || 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      const timeA = a.timeTakenSeconds || 0;
      const timeB = b.timeTakenSeconds || 0;
      if (timeA > 0 && timeB > 0 && timeA !== timeB) return timeA - timeB;
      return (b.correctCount || 0) - (a.correctCount || 0);
    });

    const rows = students.map((s, idx) => [
      idx + 1,
      s.name || "",
      s.studentId || "",
      s.collegeEmail || "",
      s.course || "",
      s.enrollmentNum || "",
      s.selectedTrack || "-",
      s.isSubmitted ? (s.cheated ? "Submitted (Cheated)" : "Submitted") : "In Progress",
      s.correctCount || 0,
      s.incorrectCount || 0,
      s.unattemptedCount || 0,
      s.totalScore || 0,
      s.timeTakenSeconds || 0,
      s.timeTakenFormatted || "-",
      s.submittedAt ? new Date(s.submittedAt).toISOString() : "-",
      new Date().toISOString(),
      s.cheated ? "Yes" : "No",
    ]);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A2:Q`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: rows,
      },
    });

    await sortLeaderboardRange(spreadsheetId, 0, rows.length + 1);

    return NextResponse.json({
      status: "success",
      message: "Leaderboard synced to Google Sheets with dual ranking applied.",
      studentsCount: students.length,
      spreadsheetId,
    });
  } catch (err: any) {
    console.error("[API admin/sync-sheets] Error:", err);
    let message = err?.message || "Failed to sync to Google Sheets";
    if (
      err?.status === 403 ||
      message.includes("Google Sheets API has not been used") ||
      message.includes("disabled")
    ) {
      message =
        "Google Sheets API is not enabled in your Google Cloud Project. Enable it at: https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=67889274113";
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
