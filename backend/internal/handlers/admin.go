package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sort"
	"time"

	"kindle-jr/internal/db"
	"kindle-jr/internal/sheets"
)

// requireAdmin validates the X-Admin-Key header against ADMIN_SECRET.
//
// The secret may also arrive as an ?key= query parameter so an admin action can
// be triggered from a plain link (which cannot set custom headers).
func requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := os.Getenv("ADMIN_SECRET")
		if secret == "" {
			writeJSONError(w, http.StatusInternalServerError, "ADMIN_SECRET not configured on server")
			return
		}

		provided := r.Header.Get("X-Admin-Key")
		if provided == "" {
			provided = r.URL.Query().Get("key")
		}

		if provided != secret {
			writeJSONError(w, http.StatusUnauthorized, "Unauthorized — invalid or missing X-Admin-Key header")
			return
		}
		next(w, r)
	}
}

func writeJSONError(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// StudentEntry is the wire format for one leaderboard row.
type StudentEntry struct {
	Rank               int    `json:"rank"`
	StudentID          string `json:"studentId"`
	Name               string `json:"name"`
	CollegeEmail       string `json:"collegeEmail"`
	Course             string `json:"course"`
	EnrollmentNum      string `json:"enrollmentNum"`
	SelectedTrack      string `json:"selectedTrack"`
	TotalScore         int    `json:"totalScore"`
	CorrectCount       int    `json:"correctCount"`
	IncorrectCount     int    `json:"incorrectCount"`
	UnattemptedCount   int    `json:"unattemptedCount"`
	TimeTakenSeconds   int    `json:"timeTakenSeconds"`
	TimeTakenFormatted string `json:"timeTakenFormatted"`
	IsSubmitted        bool   `json:"isSubmitted"`
	RegisteredAt       string `json:"registeredAt,omitempty"`
}

// GetLeaderboard returns all students with rank plus aggregate telemetry so the
// master admin dashboard can render its summary cards from a single request.
func GetLeaderboard(store *db.Store) http.HandlerFunc {
	return requireAdmin(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")

		students, err := store.GetAllStudents(r.Context())
		if err != nil {
			log.Printf("[ADMIN] Leaderboard fetch error: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Failed to fetch students")
			return
		}

		ranked := sheets.RankStudents(students)

		entries := make([]StudentEntry, 0, len(ranked))
		submitted := 0
		scoreSum := 0
		var lastUpdated time.Time
		for i, s := range ranked {
			if s.IsSubmitted {
				submitted++
				scoreSum += s.TotalScore
			}
			if s.UpdatedAt.After(lastUpdated) {
				lastUpdated = s.UpdatedAt
			}

			entry := StudentEntry{
				Rank:               i + 1,
				StudentID:          s.StudentID,
				Name:               s.Name,
				CollegeEmail:       s.CollegeEmail,
				Course:             s.Course,
				EnrollmentNum:      s.EnrollmentNum,
				SelectedTrack:      s.SelectedTrack,
				TotalScore:         s.TotalScore,
				CorrectCount:       s.CorrectCount,
				IncorrectCount:     s.IncorrectCount,
				UnattemptedCount:   s.UnattemptedCount,
				TimeTakenSeconds:   s.TimeTakenSeconds,
				TimeTakenFormatted: s.TimeTakenFormatted,
				IsSubmitted:        s.IsSubmitted,
			}
			if s.RegisteredAt != nil {
				entry.RegisteredAt = s.RegisteredAt.Format(time.RFC3339)
			}
			entries = append(entries, entry)
		}

		avgScore := 0.0
		if submitted > 0 {
			avgScore = float64(scoreSum) / float64(submitted)
		}

		lastUpdatedStr := ""
		if !lastUpdated.IsZero() {
			lastUpdatedStr = lastUpdated.Format(time.RFC3339)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"totalStudents":   len(entries),
			"submittedCount":  submitted,
			"averageScore":    avgScore,
			"lastUpdated":     lastUpdatedStr,
			"persistenceMode": store.Backend,
			"persistenceNote": store.Reason,
			"students":        entries,
		})
	})
}

// GetLateSubmissions exposes post-deadline submissions to the admin dashboard.
func GetLateSubmissions(store *db.Store) http.HandlerFunc {
	return requireAdmin(func(w http.ResponseWriter, r *http.Request) {
		late, err := store.GetLateSubmissions(r.Context())
		if err != nil {
			log.Printf("[ADMIN] Late submission fetch error: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Failed to fetch late submissions")
			return
		}

		sort.Slice(late, func(i, j int) bool { return late[i].RecordedAt.After(late[j].RecordedAt) })

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"totalLate": len(late),
			"students":  late,
		})
	})
}

// SyncSheets rebuilds the live Google Sheet from Firestore and re-applies the
// dual sort. This is the reconciliation path: the sheet is always derivable
// from Firestore, so a failed real-time sync is self-healing on the next call.
func SyncSheets(store *db.Store) http.HandlerFunc {
	return requireAdmin(func(w http.ResponseWriter, r *http.Request) {
		students, err := store.GetAllStudents(r.Context())
		if err != nil {
			log.Printf("[ADMIN] Sheets export fetch error: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Failed to fetch students")
			return
		}

		spreadsheetID := sheets.SpreadsheetID()
		if spreadsheetID == "" {
			writeJSONError(w, http.StatusInternalServerError,
				"No spreadsheet configured - set GOOGLE_SHEET_ID on the server")
			return
		}

		if err := sheets.SyncLeaderboardToSheet(r.Context(), spreadsheetID, sheets.ParseSheetID(), students); err != nil {
			log.Printf("[ADMIN] Sheets sync failed: %v", err)
			writeJSONError(w, http.StatusInternalServerError, "Sheets sync failed: "+err.Error())
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":        "success",
			"message":       "Leaderboard synced to Google Sheets with ranking applied.",
			"studentsCount": len(students),
			"spreadsheetId": spreadsheetID,
		})
	})
}
