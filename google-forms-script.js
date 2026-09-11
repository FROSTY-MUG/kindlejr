/**
 * Google Apps Script for Google Form Pre-Registration Trigger
 * 
 * Instructions:
 * 1. Open your Google Form -> Click the 3 dots menu -> Select "Script editor".
 * 2. Paste this code into the editor.
 * 3. Replace BACKEND_WEBHOOK_URL with your deployed Go backend URL (e.g. https://your-domain.com/api/webhook/google-forms).
 * 4. Save and click "Triggers" (Clock icon on left sidebar).
 * 5. Add a new trigger: Function: "onFormSubmit", Event source: "From form", Event type: "On form submit".
 */

const BACKEND_WEBHOOK_URL = "http://localhost:8080/api/webhook/google-forms";

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

    // Map form fields by question title
    for (let i = 0; i < itemResponses.length; i++) {
      const title = itemResponses[i].getItem().getTitle().toLowerCase();
      const response = itemResponses[i].getResponse();

      if (title.includes("name")) {
        payload.name = response;
      } else if (title.includes("personal email")) {
        payload.personalEmail = response;
      } else if (title.includes("college email")) {
        payload.collegeEmail = response;
      } else if (title.includes("course")) {
        payload.course = response;
      } else if (title.includes("student id") || title.includes("student_id")) {
        payload.studentId = response;
      } else if (title.includes("enrollment") || title.includes("enrollment number")) {
        payload.enrollmentNum = response;
      }
    }

    if (!payload.studentId) return;

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    UrlFetchApp.fetch(BACKEND_WEBHOOK_URL, options);
    Logger.log("Successfully forwarded form submission to Kindle Jr webhook: " + payload.studentId);
  } catch (error) {
    Logger.log("Error in onFormSubmit webhook trigger: " + error.toString());
  }
}
