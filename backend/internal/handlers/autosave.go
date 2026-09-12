package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"kindle-jr/internal/db"
	"kindle-jr/internal/models"
	"kindle-jr/internal/sheets"
	"kindle-jr/internal/utils"
)

type AutoSavePayload struct {
	StudentID       string `json:"studentId"`
	QuestionID      string `json:"questionId"`
	Answer          string `json:"answer"`
	CurrentQuestion int    `json:"currentQuestion"`
	StartTimerNow   bool   `json:"startTimerNow"`
}

// RealTimeAutoSaveAnswer handles debounced answer selection, performs real-time
// partial grading and persists the updated state.
//
// Performance note: this endpoint runs on every debounced keystroke, so it does
// no network I/O of its own. The answer key is served from an in-process cache
// and persistence is non-blocking (see Store.UpsertStudentMap).
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

		// Dual-write: mirror the updated record to the live Google Sheet via rate-limited queue.
		// The queue coalesces rapid keystrokes from the same student and throttles
		// requests safely below Google Sheets API quota (max 150/min vs 300/min quota).
		syncSnapshot := *existingState
		syncSnapshot.UpdatedAt = time.Now().UTC()
		sheets.QueueStudentSync(syncSnapshot)

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

// answerKeyCache memoises the parsed answer keys per track. The question bank
// is static for the lifetime of the process, so reading and JSON-parsing it on
// every keystroke was pure waste - it is now read once per track and reused.
var (
	answerKeyMu    sync.RWMutex
	answerKeyCache = map[string]map[string]string{}
)

// loadAnswerKey returns the QuestionID -> correct answer map for a track,
// reading the JSON files only on the first call for that track.
func loadAnswerKey(dataPath, track string) map[string]string {
	cacheKey := strings.ToLower(track) + "|" + dataPath
	answerKeyMu.RLock()
	cached, ok := answerKeyCache[cacheKey]
	answerKeyMu.RUnlock()
	if ok {
		return cached
	}

	answerKey := map[string]string{}

	codeFile := "questions_c.json"
	if strings.ToLower(track) == "python" {
		codeFile = "questions_python.json"
	}
	if codeBytes, err := os.ReadFile(filepath.Join(dataPath, codeFile)); err == nil {
		var codingQuestions []models.Question
		if json.Unmarshal(codeBytes, &codingQuestions) == nil {
			for _, q := range codingQuestions {
				answerKey[q.ID] = q.Answer
			}
		}
	} else {
		log.Printf("[ANSWERKEY] Could not read coding bank %s: %v", codeFile, err)
	}

	// Only cache a fully-populated key; an empty map would permanently mask a
	// transient startup error (e.g. a volume not yet mounted).
	if len(answerKey) > 0 {
		answerKeyMu.Lock()
		answerKeyCache[cacheKey] = answerKey
		answerKeyMu.Unlock()
	}

	return answerKey
}
