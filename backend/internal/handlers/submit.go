package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kindle-jr/internal/db"
	"kindle-jr/internal/models"
	"kindle-jr/internal/sheets"
	"kindle-jr/internal/utils"
)

type SubmitPayload struct {
	StudentID string            `json:"studentId"`
	Answers   map[string]string `json:"answers,omitempty"`
}

type SubmitResponse struct {
	Status           string    `json:"status"`
	StudentID        string    `json:"studentId"`
	TotalScore       int       `json:"totalScore"`
	MaxScore         int       `json:"maxScore"`
	CorrectCount     int       `json:"correctCount"`
	IncorrectCount   int       `json:"incorrectCount"`
	UnattemptedCount int       `json:"unattemptedCount"`
	SubmittedAt      time.Time `json:"submittedAt"`
}

// syncStudentToSheetInBackground mirrors one student's final record to the live
// Google Sheet without blocking the HTTP response.
//
// A per-row upsert is used rather than rewriting the whole transcript: the row
// already exists from the real-time answer syncs, so this is a single read plus
// a single write. The full-table reconciliation is available on demand via the
// admin "Sync Sheets" endpoint.
func syncStudentToSheetInBackground(student models.StudentState) {
	if sheets.SpreadsheetID() == "" {
		return // Sheets not configured; Firestore remains the source of truth
	}

	go func(st models.StudentState) {
		ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer cancel()

		if err := sheets.SyncStudentRow(ctx, st); err != nil {
			log.Printf("[SHEETS] final row sync failed for %s: %v", st.StudentID, err)
			return
		}
		log.Printf("[SHEETS] final row synced for %s", st.StudentID)
	}(student)
}

// SubmitQuiz grades all answers, persists the final score, syncs to Google
// Sheets in real time, and returns the result.
func SubmitQuiz(store *db.Store, dataPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload SubmitPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil && payload.StudentID == "" {
			http.Error(w, "Invalid submission payload", http.StatusBadRequest)
			return
		}

		if payload.StudentID == "" {
			http.Error(w, "studentId is required", http.StatusBadRequest)
			return
		}

		ctx := r.Context()
		student, err := store.GetStudent(ctx, payload.StudentID)
		if err != nil {
			http.Error(w, "Student not found for submission", http.StatusNotFound)
			return
		}

		// Merge payload answers if supplied
		if student.Answers == nil {
			student.Answers = make(map[string]string)
		}
		for qID, ans := range payload.Answers {
			student.Answers[qID] = ans
		}

		// Load ground truth questions
		aptBytes, err := os.ReadFile(filepath.Join(dataPath, "questions_aptitude.json"))
		if err != nil {
			http.Error(w, "Error reading aptitude answer key", http.StatusInternalServerError)
			return
		}

		var aptitudeQuestions []models.Question
		_ = json.Unmarshal(aptBytes, &aptitudeQuestions)

		codeFile := "questions_c.json"
		if strings.ToLower(student.SelectedTrack) == "python" {
			codeFile = "questions_python.json"
		}
		codeBytes, err := os.ReadFile(filepath.Join(dataPath, codeFile))
		if err != nil {
			http.Error(w, "Error reading coding answer key", http.StatusInternalServerError)
			return
		}

		var codingQuestions []models.Question
		_ = json.Unmarshal(codeBytes, &codingQuestions)

		answerKey := make(map[string]string)
		for _, q := range aptitudeQuestions {
			answerKey[q.ID] = q.Answer
		}
		for _, q := range codingQuestions {
			answerKey[q.ID] = q.Answer
		}

		correctCount := 0
		incorrectCount := 0
		unattemptedCount := 0

		for qID, correctAns := range answerKey {
			userAns, exists := student.Answers[qID]
			if !exists || strings.TrimSpace(userAns) == "" {
				unattemptedCount++
				continue
			}

			cleanUser := utils.NormalizeAnswer(userAns)
			cleanCorrect := utils.NormalizeAnswer(correctAns)
			if cleanUser != "" && cleanUser == cleanCorrect {
				correctCount++
			} else {
				incorrectCount++
			}
		}

		totalScore := correctCount // 1 mark per correct answer
		now := time.Now().UTC()

		timeTakenSeconds := 0
		timeTakenFormatted := "-"

		if student.StartedAt != nil {
			timeTakenSeconds = int(now.Sub(*student.StartedAt).Seconds())
		} else if student.RegisteredAt != nil {
			timeTakenSeconds = int(now.Sub(*student.RegisteredAt).Seconds())
		}

		if timeTakenSeconds > 0 {
			mins := timeTakenSeconds / 60
			secs := timeTakenSeconds % 60
			timeTakenFormatted = fmt.Sprintf("%02dm %02ds", mins, secs)
		}

		student.IsSubmitted = true
		student.TotalScore = totalScore
		student.CorrectCount = correctCount
		student.IncorrectCount = incorrectCount
		student.UnattemptedCount = unattemptedCount
		student.TimeTakenSeconds = timeTakenSeconds
		student.TimeTakenFormatted = timeTakenFormatted
		student.SubmittedAt = &now

		updates := map[string]interface{}{
			"answers":            student.Answers,
			"isSubmitted":        true,
			"totalScore":         totalScore,
			"correctCount":       correctCount,
			"incorrectCount":     incorrectCount,
			"unattemptedCount":   unattemptedCount,
			"timeTakenSeconds":   timeTakenSeconds,
			"timeTakenFormatted": timeTakenFormatted,
			"submittedAt":        &now,
		}

		if err := store.UpsertStudentMap(ctx, student.StudentID, updates); err != nil {
			log.Printf("[WARN] Error persisting final score: %v", err)
		}

		// Fire-and-forget: mirror this student's final row to the live Sheet.
		syncStudentToSheetInBackground(*student)

		resp := SubmitResponse{
			Status:           "submitted",
			StudentID:        student.StudentID,
			TotalScore:       totalScore,
			MaxScore:         60,
			CorrectCount:     correctCount,
			IncorrectCount:   incorrectCount,
			UnattemptedCount: unattemptedCount,
			SubmittedAt:      now,
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(resp)
	}
}
