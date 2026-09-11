package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kindle-jr/internal/db"
	"kindle-jr/internal/models"
	"kindle-jr/internal/utils"
)

type AutoSavePayload struct {
	StudentID       string `json:"studentId"`
	QuestionID      string `json:"questionId"`
	Answer          string `json:"answer"`
	CurrentQuestion int    `json:"currentQuestion"`
	StartTimerNow   bool   `json:"startTimerNow"`
}

// RealTimeAutoSaveAnswer handles debounced answer selection, performs real-time partial grading,
// and persists the updated state to Firestore.
// Google Sheets export only happens on final submission (SubmitQuiz), not on every auto-save.
func RealTimeAutoSaveAnswer(store *db.Store, dataPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload AutoSavePayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "Invalid request payload", http.StatusBadRequest)
			return
		}

		if payload.StudentID == "" {
			http.Error(w, "StudentID is required", http.StatusBadRequest)
			return
		}

		ctx := r.Context()
		existingState, err := store.GetStudent(ctx, payload.StudentID)
		if err != nil || existingState == nil {
			existingState = &models.StudentState{
				StudentID: payload.StudentID,
				Answers:   make(map[string]string),
			}
		}

		if existingState.Answers == nil {
			existingState.Answers = make(map[string]string)
		}

		// 1. Intercept submitted QuestionID and Answer
		if payload.QuestionID != "" {
			existingState.Answers[payload.QuestionID] = payload.Answer
		}

		existingState.CurrentQuestion = payload.CurrentQuestion

		// Start timer timestamp if requested
		if existingState.StartedAt == nil && payload.StartTimerNow {
			now := time.Now().UTC()
			existingState.StartedAt = &now
		}

		// 2. Real-time Partial Grading against answer key
		answerKey := loadAnswerKey(dataPath, existingState.SelectedTrack)

		correctCount := 0
		incorrectCount := 0
		unattemptedCount := 0

		if len(answerKey) > 0 {
			for qID, correctAns := range answerKey {
				userAns, exists := existingState.Answers[qID]
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
		}

		totalScore := correctCount

		existingState.TotalScore = totalScore
		existingState.CorrectCount = correctCount
		existingState.IncorrectCount = incorrectCount
		existingState.UnattemptedCount = unattemptedCount

		// 3. Persist updated score & answers to Firestore
		updates := map[string]interface{}{
			"currentQuestion":  payload.CurrentQuestion,
			"answers":          existingState.Answers,
			"totalScore":       totalScore,
			"correctCount":     correctCount,
			"incorrectCount":   incorrectCount,
			"unattemptedCount": unattemptedCount,
		}

		if payload.QuestionID != "" {
			updates["answers."+payload.QuestionID] = payload.Answer
		}
		if existingState.StartedAt != nil {
			updates["startedAt"] = existingState.StartedAt
		}

		if err := store.UpsertStudentMap(ctx, payload.StudentID, updates); err != nil {
			log.Printf("[ERROR] Auto-save failed for student %s: %v", payload.StudentID, err)
			http.Error(w, "Failed to persist real-time answer", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":           "success",
			"studentId":        payload.StudentID,
			"realtimeScore":    totalScore,
			"correctCount":     correctCount,
			"incorrectCount":   incorrectCount,
			"unattemptedCount": unattemptedCount,
		})
	}
}

func loadAnswerKey(dataPath, track string) map[string]string {
	answerKey := make(map[string]string)

	aptBytes, err := os.ReadFile(filepath.Join(dataPath, "questions_aptitude.json"))
	if err == nil {
		var aptitudeQuestions []models.Question
		if json.Unmarshal(aptBytes, &aptitudeQuestions) == nil {
			for _, q := range aptitudeQuestions {
				answerKey[q.ID] = q.Answer
			}
		}
	}

	codeFile := "questions_c.json"
	if strings.ToLower(track) == "python" {
		codeFile = "questions_python.json"
	}
	codeBytes, err := os.ReadFile(filepath.Join(dataPath, codeFile))
	if err == nil {
		var codingQuestions []models.Question
		if json.Unmarshal(codeBytes, &codingQuestions) == nil {
			for _, q := range codingQuestions {
				answerKey[q.ID] = q.Answer
			}
		}
	}

	return answerKey
}
