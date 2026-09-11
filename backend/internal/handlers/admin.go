package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sort"

	"kindle-jr/internal/db"
	"kindle-jr/internal/sheets"
)

// requireAdmin validates the X-Admin-Key header against the ADMIN_SECRET env var.
func requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := os.Getenv("ADMIN_SECRET")
		if secret == "" {
			http.Error(w, `{"error":"ADMIN_SECRET not configured on server"}`, http.StatusInternalServerError)
			return
		}
		if r.Header.Get("X-Admin-Key") != secret {
			http.Error(w, `{"error":"Unauthorized — invalid or missing X-Admin-Key header"}`, http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

// GetLeaderboard returns all students sorted by totalScore descending with rank.
func GetLeaderboard(store *db.Store) http.HandlerFunc {
	return requireAdmin(func(w http.ResponseWriter, r *http.Request) {
		students, err := store.GetAllStudents(r.Context())
		if err != nil {
			log.Printf("[ADMIN] Leaderboard fetch error: %v", err)
			http.Error(w, `{"error":"Failed to fetch students from Firestore"}`, http.StatusInternalServerError)
			return
		}

		sort.Slice(students, func(i, j int) bool {
			if students[i].TotalScore != students[j].TotalScore {
				return students[i].TotalScore > students[j].TotalScore
			}
			if students[i].TimeTakenSeconds != students[j].TimeTakenSeconds && students[i].TimeTakenSeconds > 0 && students[j].TimeTakenSeconds > 0 {
				return students[i].TimeTakenSeconds < students[j].TimeTakenSeconds
			}
			return students[i].CorrectCount > students[j].CorrectCount
		})

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
		}

		entries := make([]StudentEntry, 0, len(students))
		for i, s := range students {
			entries = append(entries, StudentEntry{
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
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"totalStudents": len(entries),
			"students":      entries,
		})
	})
}

// ExportSheets triggers a bulk export of all students to Google Sheets with rankings.
func ExportSheets(store *db.Store) http.HandlerFunc {
	return requireAdmin(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		students, err := store.GetAllStudents(ctx)
		if err != nil {
			log.Printf("[ADMIN] Export fetch error: %v", err)
			http.Error(w, `{"error":"Failed to fetch students from Firestore"}`, http.StatusInternalServerError)
			return
		}

		if err := sheets.BulkExportStudents(ctx, students); err != nil {
			log.Printf("[ADMIN] Bulk export to Sheets failed: %v", err)
			http.Error(w, `{"error":"Google Sheets bulk export failed"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":        "bulk_export_successful",
			"studentsCount": len(students),
			"message":       "All student records exported and ranked in Google Sheets.",
		})
	})
}
