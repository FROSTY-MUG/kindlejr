package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"kindle-jr/internal/db"
)

type GoogleFormWebhookPayload struct {
	StudentID     string `json:"studentId"`
	Name          string `json:"name"`
	PersonalEmail string `json:"personalEmail"`
	CollegeEmail  string `json:"collegeEmail"`
	Course        string `json:"course"`
	EnrollmentNum string `json:"enrollmentNum"`
}

// GoogleFormsWebhook ingests student pre-registration data directly from Google Forms Apps Script triggers.
func GoogleFormsWebhook(store *db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload GoogleFormWebhookPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid webhook payload", http.StatusBadRequest)
			return
		}

		if payload.StudentID == "" {
			http.Error(w, "studentId is required", http.StatusBadRequest)
			return
		}

		updates := map[string]interface{}{
			"studentId":     payload.StudentID,
			"name":          payload.Name,
			"personalEmail": payload.PersonalEmail,
			"collegeEmail":  payload.CollegeEmail,
			"course":        payload.Course,
			"enrollmentNum": payload.EnrollmentNum,
			"updatedAt":     time.Now().UTC(),
		}

		ctx := r.Context()
		if err := store.UpsertStudentMap(ctx, payload.StudentID, updates); err != nil {
			http.Error(w, "Failed to ingest webhook record", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{
			"status":    "success",
			"message":   "Student pre-registration ingested successfully from Google Form",
			"studentId": payload.StudentID,
		})
	}
}

// IngestGoogleForms is an alias handler for GoogleFormsWebhook
func IngestGoogleForms(store *db.Store) http.HandlerFunc {
	return GoogleFormsWebhook(store)
}
