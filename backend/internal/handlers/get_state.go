package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"kindle-jr/internal/db"
	"kindle-jr/internal/models"
)

type StateResponse struct {
	Student             *models.StudentState `json:"student"`
	RemainingSeconds    int                  `json:"remainingSeconds"`
	TimeExpired         bool                 `json:"timeExpired"`
	DisconnectedSeconds int                  `json:"disconnectedSeconds"`
	BufferExpired       bool                 `json:"bufferExpired"`
	ShouldAutoSubmit    bool                 `json:"shouldAutoSubmit"`
}

// GetState fetches current quiz state and calculates exact remaining timer duration and reconnection buffer.
func GetState(store *db.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		studentID := vars["studentId"]
		if studentID == "" {
			studentID = r.URL.Query().Get("studentId")
		}

		if studentID == "" {
			http.Error(w, "studentId parameter missing", http.StatusBadRequest)
			return
		}

		ctx := r.Context()
		student, err := store.GetStudent(ctx, studentID)
		if err != nil {
			http.Error(w, "Student record not found", http.StatusNotFound)
			return
		}

		remainingSeconds := 3600 // 60 minutes default
		timeExpired := false
		disconnectedSeconds := 0
		bufferExpired := false
		shouldAutoSubmit := false

		now := time.Now().UTC()

		if student.StartedAt != nil {
			elapsed := now.Sub(*student.StartedAt).Seconds()
			remainingSeconds = 3600 - int(elapsed)

			// Calculate time since last activity
			if !student.UpdatedAt.IsZero() {
				disconnectedSeconds = int(now.Sub(student.UpdatedAt).Seconds())
				// 15-minute reconnection buffer (900 seconds)
				if disconnectedSeconds > 900 && !student.IsSubmitted {
					bufferExpired = true
				}
			}

			if remainingSeconds <= 0 {
				remainingSeconds = 0
				timeExpired = true
			}

			// If time remaining is <= 30 seconds or 15m buffer exceeded, force auto-submit
			if timeExpired || remainingSeconds <= 30 || bufferExpired {
				shouldAutoSubmit = true
			}
		}

		resp := StateResponse{
			Student:             student,
			RemainingSeconds:    remainingSeconds,
			TimeExpired:         timeExpired,
			DisconnectedSeconds: disconnectedSeconds,
			BufferExpired:       bufferExpired,
			ShouldAutoSubmit:    shouldAutoSubmit,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	}
}
