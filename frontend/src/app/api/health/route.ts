import { NextResponse } from "next/server";
import { getFirestore } from "../../../lib/firebase";
import { getSpreadsheetId } from "../../../lib/sheets";

export async function GET() {
  const db = getFirestore();
  const spreadsheetId = getSpreadsheetId();

  return NextResponse.json({
    status: "ok",
    service: "kindle-jr-vercel-engine",
    firestore: db !== null,
    sheets: !!spreadsheetId,
    spreadsheetId,
    timestamp: new Date().toISOString(),
  });
}
