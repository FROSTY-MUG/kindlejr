package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"kindle-jr/internal/db"
)

type InitQuizPayload struct {
	StudentID     string `json:"studentId"`
	SelectedTrack string `json:"selectedTrack"` // "C" or "Python"
	ShuffledOrder []int  `json:"shuffledOrder"`
}

// InitQuiz saves track selection and the client-shuffled question order array.
func InitQuiz(store *db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload InitQuizPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid request payload", http.StatusBadRequest)
			return
		}

		if payload.StudentID == "" || payload.SelectedTrack == "" {
			http.Error(w, "StudentID and SelectedTrack are required", http.StatusBadRequest)
			return
		}

		ctx := r.Context()
		now := time.Now().UTC()

		existing, _ := store.GetStudent(ctx, payload.StudentID)
		var startedAt *time.Time = &now
		if existing != nil && existing.StartedAt != nil {
			startedAt = existing.StartedAt
		}

		updates := map[string]interface{}{
			"selectedTrack": payload.SelectedTrack,
			"shuffledOrder": payload.ShuffledOrder,
			"startedAt":     startedAt,
			"updatedAt":     now,
		}

		if err := store.UpsertStudentMap(ctx, payload.StudentID, updates); err != nil {
			http.Error(w, "Failed to initialize quiz track", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	}
}
