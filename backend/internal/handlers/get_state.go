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
	Student          *models.StudentState `json:"student"`
	RemainingSeconds int                  `json:"remainingSeconds"`
	TimeExpired      bool                 `json:"timeExpired"`
}

// GetState fetches current quiz state and calculates exact remaining timer duration.
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

		remainingSeconds := 4200 // 70 minutes default
		timeExpired := false

		if student.StartedAt != nil {
			elapsed := time.Now().UTC().Sub(*student.StartedAt).Seconds()
			remainingSeconds = 4200 - int(elapsed)
			if remainingSeconds <= 0 {
				remainingSeconds = 0
				timeExpired = true
			}
		}

		resp := StateResponse{
			Student:          student,
			RemainingSeconds: remainingSeconds,
			TimeExpired:      timeExpired,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	}
}
