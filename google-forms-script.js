/**
 * Google Apps Script for Google Form Pre-Registration Trigger
 *
 * Instructions:
 * 1. Open your Google Form -> Click the 3 dots menu -> Select "Script editor".
 * 2. Paste this code into the editor.
 * 3. Set BACKEND_WEBHOOK_URL below to your deployed Go backend
 *    (Railway URL + /api/webhook/google-forms).
 * 4. Save and click "Triggers" (Clock icon on left sidebar).
 * 5. Add a new trigger: Function: "onFormSubmit", Event source: "From form",
 *    Event type: "On form submit".
 *
 * The backend persists the submission to Firestore and mirrors it to the live
 * Google Sheet, so this script only needs to deliver the payload once.
 */

// Production backend. Swap to http://localhost:8080/api/webhook/google-forms
// when testing locally (Apps Script cannot reach localhost, use a tunnel).
const BACKEND_WEBHOOK_URL =
  "https://kindle-jr-backend-production.up.railway.app/api/webhook/google-forms";

function onFormSubmit(e) {
  try {
    const itemResponses = e.response.getItemResponses();
    let payload = {
      name: "",
      personalEmail: "",
      collegeEmail: "",
      course: "",
      studentId: "",
      enrollmentNum: ""
    };

    // Map form fields by question title.
    //
    // Order matters: the more specific matchers must run before the generic
    // "name" catch-all, otherwise a title like "Student Name" or "Course Name"
    // is misread as the person's name. Matching is intentionally explicit.
    for (let i = 0; i < itemResponses.length; i++) {
      const title = itemResponses[i].getItem().getTitle().toLowerCase();
      const response = itemResponses[i].getResponse();

      if (title.includes("student id") || title.includes("student_id")) {
        payload.studentId = response;
      } else if (title.includes("enrollment")) {
        payload.enrollmentNum = response;
      } else if (title.includes("personal email")) {
        payload.personalEmail = response;
      } else if (title.includes("college email")) {
        payload.collegeEmail = response;
      } else if (title.includes("course")) {
        payload.course = response;
      } else if (title.includes("name")) {
        // Catch-all: only reached for a genuine name field.
        payload.name = response;
      }
    }

    if (!payload.studentId) {
      Logger.log("Skipped: submission has no student id.");
      return;
    }

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    // Retry with backoff: a cold-starting backend can briefly refuse
    // connections, and losing a registration silently is not acceptable.
    var response = null;
    for (var attempt = 1; attempt <= 3; attempt++) {
      response = UrlFetchApp.fetch(BACKEND_WEBHOOK_URL, options);
      const code = response.getResponseCode();
      if (code >= 200 && code < 300) {
        Logger.log(
          "Forwarded " + payload.studentId + " to Kindle Jr webhook (HTTP " + code + ")."
        );
        return;
      }
      Logger.log("Attempt " + attempt + " failed with HTTP " + code);
      Utilities.sleep(attempt * 1000);
    }

    // All retries exhausted - surface it loudly so it shows in the trigger log.
    Logger.log(
      "ERROR: could not forward " + payload.studentId + " after 3 attempts. Body: " +
      (response ? response.getContentText() : "no response")
    );
  } catch (error) {
    Logger.log("Error in onFormSubmit webhook trigger: " + error.toString());
  }
}
