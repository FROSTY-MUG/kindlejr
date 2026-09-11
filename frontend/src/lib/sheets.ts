import { google } from "googleapis";

const COLUMN_TOTAL_SCORE = 11;
const COLUMN_ELAPSED_SECS = 12;
const COLUMN_COUNT = 16;

const HEADER = [
  "Rank",
  "Name",
  "Student ID",
  "College Email",
  "Course",
  "Enrollment",
  "Track",
  "Status",
  "Correct",
  "Incorrect",
  "Unattempted",
  "Total Marks",
  "Elapsed (s)",
  "Time Taken",
  "Submitted At",
  "Last Updated",
];

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
      } catch (err) {
        console.error(`Malformed JSON in ${key}:`, err);
      }
    }

    try {
      const decoded = Buffer.from(raw, "base64").toString("utf-8");
      return JSON.parse(decoded);
    } catch (err) {
      console.error(`Invalid base64 in ${key}:`, err);
    }
  }
  return null;
}

export function getSpreadsheetId(): string {
  return (
    process.env.GOOGLE_SHEET_ID ||
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID ||
    "1SBSiQua02VMnYxD_5YBvmvjinKr0ahIojP5Hsk1fkF4"
  );
}

export function getSheetName(): string {
  return process.env.GOOGLE_SHEET_NAME || "Leaderboard";
}

function getSheetsService() {
  const creds = getCredentials();
  if (!creds) {
    throw new Error("No Google Sheets credentials found");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return google.sheets({ version: "v4", auth });
}

export async function ensureHeaders(spreadsheetId: string, sheetName: string) {
  const sheets = getSheetsService();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:P1`,
    });
    if (res.data.values && res.data.values.length > 0 && res.data.values[0].length >= COLUMN_COUNT) {
      return;
    }
  } catch {}

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [HEADER],
    },
  });
}

export async function sortLeaderboardRange(
  spreadsheetId: string,
  sheetId: number,
  rowCount: number
) {
  if (rowCount <= 1) return;
  const sheets = getSheetsService();

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          sortRange: {
            range: {
              sheetId,
              startRowIndex: 1, // preserve header
              endRowIndex: rowCount,
              startColumnIndex: 0,
              endColumnIndex: COLUMN_COUNT,
            },
            sortSpecs: [
              {
                sortOrder: "DESCENDING",
                dimensionIndex: COLUMN_TOTAL_SCORE, // Total Marks
              },
              {
                sortOrder: "ASCENDING",
                dimensionIndex: COLUMN_ELAPSED_SECS, // Elapsed (s)
              },
            ],
          },
        },
      ],
    },
  });
}

export async function syncStudentRow(student: any) {
  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) return;

  const sheetName = getSheetName();
  const sheets = getSheetsService();

  await ensureHeaders(spreadsheetId, sheetName);

  const idsRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!C2:C`,
  });

  const values = idsRes.data.values || [];
  let rowIndex = -1;

  for (let i = 0; i < values.length; i++) {
    if (values[i] && String(values[i][0]) === String(student.studentId)) {
      rowIndex = i + 2;
      break;
    }
  }

  const row = [
    0, // placeholder rank
    student.name || "",
    student.studentId || "",
    student.collegeEmail || "",
    student.course || "",
    student.enrollmentNum || "",
    student.selectedTrack || "-",
    student.isSubmitted ? "Submitted" : "In Progress",
    student.correctCount || 0,
    student.incorrectCount || 0,
    student.unattemptedCount || 0,
    student.totalScore || 0,
    student.timeTakenSeconds || 0,
    student.timeTakenFormatted || "-",
    student.submittedAt ? new Date(student.submittedAt).toISOString() : "-",
    new Date().toISOString(),
  ];

  const targetA1 =
    rowIndex === -1
      ? `${sheetName}!A${values.length + 2}`
      : `${sheetName}!A${rowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: targetA1,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [row],
    },
  });

  const totalRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!C2:C`,
  });
  const totalRows = (totalRes.data.values || []).length;
  await sortLeaderboardRange(spreadsheetId, 0, totalRows + 1);
}
