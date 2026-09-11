package handlers

import (
	"context"
	"encoding/json"
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

// SubmitQuiz grades all answers, updates Firestore, and appends the final score row
// to Google Sheets with auto-sort ranking.
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

		student.IsSubmitted = true
		student.TotalScore = totalScore
		student.CorrectCount = correctCount
		student.IncorrectCount = incorrectCount
		student.UnattemptedCount = unattemptedCount
		student.SubmittedAt = &now

		updates := map[string]interface{}{
			"answers":          student.Answers,
			"isSubmitted":      true,
			"totalScore":       totalScore,
			"correctCount":     correctCount,
			"incorrectCount":   incorrectCount,
			"unattemptedCount": unattemptedCount,
			"submittedAt":      &now,
		}

		if err := store.UpsertStudentMap(ctx, student.StudentID, updates); err != nil {
			log.Printf("[WARN] Error persisting final score to Firestore: %v", err)
		}

		// Async export & auto-sort to Google Sheets
		go func(st *models.StudentState) {
			rowData := []interface{}{
				time.Now().Format("2006-01-02 15:04:05"),
				st.Name,
				st.PersonalEmail,
				st.CollegeEmail,
				st.Course,
				st.StudentID,
				st.EnrollmentNum,
				st.SelectedTrack,
				st.CorrectCount,
				st.IncorrectCount,
				st.UnattemptedCount,
				st.TotalScore,
				"", // Rank — auto-filled by sort position
			}
			if err := sheets.AppendAndSortRankings(context.Background(), rowData); err != nil {
				log.Printf("[ERROR] Google Sheets export failed for student %s: %v", st.StudentID, err)
			}
		}(student)

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
