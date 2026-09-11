import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, Firestore } from "firebase-admin/firestore";

let firestoreDb: Firestore | null = null;

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
      console.error(`Invalid base64 credentials in ${key}:`, err);
    }
  }
  return null;
}

export function getFirestore(): Firestore | null {
  if (firestoreDb) return firestoreDb;

  try {
    if (getApps().length === 0) {
      const creds = getCredentials();
      const projectId =
        process.env.FIREBASE_PROJECT_ID ||
        creds?.project_id ||
        "kindle-jr-5-prod-b2007";

      if (creds) {
        initializeApp({
          credential: cert(creds),
          projectId,
        });
      } else {
        initializeApp({ projectId });
      }
    }

    firestoreDb = getAdminFirestore();
    return firestoreDb;
  } catch (err) {
    console.error("[FIRESTORE] Failed to initialize Firebase Admin:", err);
    return null;
  }
}

export const STUDENTS_COLLECTION = "kindle_students";
export const LATE_COLLECTION = "kindle_late_submissions";
