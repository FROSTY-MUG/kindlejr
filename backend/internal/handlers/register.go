package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"kindle-jr/internal/db"
)

type RegisterPayload struct {
	StudentID     string `json:"studentId"`
	Name          string `json:"name"`
	PersonalEmail string `json:"personalEmail"`
	CollegeEmail  string `json:"collegeEmail"`
	Course        string `json:"course"`
	EnrollmentNum string `json:"enrollmentNum"`
}

// RegisterStudent handles debounced keystrokes for student registration zero-delay auto-save.
func RegisterStudent(store *db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload RegisterPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid request payload", http.StatusBadRequest)
			return
		}

		if payload.StudentID == "" {
			http.Error(w, "StudentID is required", http.StatusBadRequest)
			return
		}

		ctx := r.Context()
		now := time.Now().UTC()

		// Fetch existing student to preserve registeredAt if present
		existing, _ := store.GetStudent(ctx, payload.StudentID)
		var registeredAt *time.Time = &now
		if existing != nil && existing.RegisteredAt != nil {
			registeredAt = existing.RegisteredAt
		}

		updates := map[string]interface{}{
			"studentId":     payload.StudentID,
			"name":          payload.Name,
			"personalEmail": payload.PersonalEmail,
			"collegeEmail":  payload.CollegeEmail,
			"course":        payload.Course,
			"enrollmentNum": payload.EnrollmentNum,
			"registeredAt":  registeredAt,
			"updatedAt":     now,
		}

		if err := store.UpsertStudentMap(ctx, payload.StudentID, updates); err != nil {
			http.Error(w, "Failed to persist registration details", http.StatusInternalServerError)
			return
		}

		// Async sync registration entry to Google Sheets
		go func() {
			st, err := store.GetStudent(context.Background(), payload.StudentID)
			if err == nil && st != nil {
				_ = sheets.UpsertStudentRow(context.Background(), st)
			} else {
				stFallback := &models.StudentState{
					StudentID:     payload.StudentID,
					Name:          payload.Name,
					PersonalEmail: payload.PersonalEmail,
					CollegeEmail:  payload.CollegeEmail,
					Course:        payload.Course,
					EnrollmentNum: payload.EnrollmentNum,
					RegisteredAt:  registeredAt,
					UpdatedAt:     now,
				}
				_ = sheets.UpsertStudentRow(context.Background(), stFallback)
			}
		}()

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}
