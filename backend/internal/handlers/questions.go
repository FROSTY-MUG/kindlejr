package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gorilla/mux"
	"kindle-jr/internal/models"
)

var (
	cacheMu     sync.RWMutex
	cachedTrack = make(map[string][]models.Question)
)

// GetSanitizedQuestions loads questions from in-memory cache and returns client-safe questions with answers stripped.
func getSanitizedQuestions(dataPath, track string) ([]models.Question, error) {
	cacheMu.RLock()
	if list, exists := cachedTrack[track]; exists {
		cacheMu.RUnlock()
		return list, nil
	}
	cacheMu.RUnlock()

	cacheMu.Lock()
	defer cacheMu.Unlock()

	// Double-check under write lock
	if list, exists := cachedTrack[track]; exists {
		return list, nil
	}

	codeFilename := "questions_c.json"
	if track == "python" {
		codeFilename = "questions_python.json"
	}
	codeFile := filepath.Join(dataPath, codeFilename)
	codeBytes, err := os.ReadFile(codeFile)
	if err != nil {
		return nil, fmt.Errorf("failed to load questions for track %s: %w", track, err)
	}

	var rawQuestions []models.Question
	if err := json.Unmarshal(codeBytes, &rawQuestions); err != nil {
		return nil, fmt.Errorf("failed to parse questions: %w", err)
	}

	// Strip answer and explanation for anti-cheat protection
	sanitized := make([]models.Question, len(rawQuestions))
	for i, q := range rawQuestions {
		sanitized[i] = models.Question{
			ID:      q.ID,
			Type:    q.Type,
			Section: q.Section,
			Text:    q.Text,
			Options: q.Options,
		}
	}

	cachedTrack[track] = sanitized
	return sanitized, nil
}

// GetQuestions returns the full 60 question bank for a track with answers 100% stripped.
func GetQuestions(dataPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		track := strings.ToLower(vars["track"])

		questions, err := getSanitizedQuestions(dataPath, track)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(questions)
	}
}

