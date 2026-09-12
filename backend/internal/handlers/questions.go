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

// LoadTrackQuestions resolves questions from dataPath or root cquestions.json / pythonquestions.json
func LoadTrackQuestions(dataPath, track string) ([]models.Question, error) {
	normTrack := strings.ToLower(track)
	var candidates []string
	if normTrack == "python" {
		candidates = []string{
			filepath.Join(dataPath, "questions_python.json"),
			filepath.Join(dataPath, "pythonquestions.json"),
			"pythonquestions.json",
			filepath.Join("..", "pythonquestions.json"),
			filepath.Join("..", "..", "pythonquestions.json"),
			filepath.Join("data", "questions_python.json"),
		}
	} else {
		candidates = []string{
			filepath.Join(dataPath, "questions_c.json"),
			filepath.Join(dataPath, "cquestions.json"),
			"cquestions.json",
			filepath.Join("..", "cquestions.json"),
			filepath.Join("..", "..", "cquestions.json"),
			filepath.Join("data", "questions_c.json"),
		}
	}

	var codeBytes []byte
	var readErr error
	for _, p := range candidates {
		if b, err := os.ReadFile(p); err == nil && len(b) > 0 {
			codeBytes = b
			readErr = nil
			break
		} else {
			readErr = err
		}
	}

	if len(codeBytes) == 0 {
		return nil, fmt.Errorf("failed to load questions for track %s: %w", track, readErr)
	}

	var rawQuestions []models.Question
	if err := json.Unmarshal(codeBytes, &rawQuestions); err == nil && len(rawQuestions) > 0 {
		return rawQuestions, nil
	}

	// Wrapper format fallback: { "questions": [ ... ] }
	var wrapper struct {
		Questions []struct {
			ID       interface{}       `json:"id"`
			Question string            `json:"question"`
			Options  map[string]string `json:"options"`
			Answer   string            `json:"answer"`
		} `json:"questions"`
	}
	if err := json.Unmarshal(codeBytes, &wrapper); err == nil && len(wrapper.Questions) > 0 {
		prefix := "c"
		section := "C Language"
		if normTrack == "python" {
			prefix = "py"
			section = "Python"
		}
		converted := make([]models.Question, 0, len(wrapper.Questions))
		for _, q := range wrapper.Questions {
			optArr := []string{}
			correctAns := ""
			for _, letter := range []string{"A", "B", "C", "D"} {
				if val, ok := q.Options[letter]; ok {
					optArr = append(optArr, val)
					if strings.EqualFold(letter, q.Answer) {
						correctAns = val
					}
				}
			}
			if correctAns == "" {
				correctAns = q.Answer
			}
			converted = append(converted, models.Question{
				ID:      fmt.Sprintf("%s_%v", prefix, q.ID),
				Type:    "mcq",
				Section: section,
				Text:    q.Question,
				Options: optArr,
				Answer:  correctAns,
			})
		}
		return converted, nil
	}

	return nil, fmt.Errorf("failed to parse questions for track %s", track)
}

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

	rawQuestions, err := LoadTrackQuestions(dataPath, track)
	if err != nil {
		return nil, err
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

