package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gorilla/mux"
	"kindle-jr/internal/models"
)

// GetQuestions returns the full 60 question bank (15 Aptitude + 45 Coding) for a track.
func GetQuestions(dataPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		track := strings.ToLower(vars["track"])

		aptFile := filepath.Join(dataPath, "questions_aptitude.json")
		aptBytes, err := os.ReadFile(aptFile)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to load aptitude questions: %v", err), http.StatusInternalServerError)
			return
		}

		var aptitudeQuestions []models.Question
		if err := json.Unmarshal(aptBytes, &aptitudeQuestions); err != nil {
			http.Error(w, "Failed to parse aptitude questions", http.StatusInternalServerError)
			return
		}

		codeFilename := "questions_c.json"
		if track == "python" {
			codeFilename = "questions_python.json"
		}
		codeFile := filepath.Join(dataPath, codeFilename)
		codeBytes, err := os.ReadFile(codeFile)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to load coding questions for track %s: %v", track, err), http.StatusInternalServerError)
			return
		}

		var codingQuestions []models.Question
		if err := json.Unmarshal(codeBytes, &codingQuestions); err != nil {
			http.Error(w, "Failed to parse coding questions", http.StatusInternalServerError)
			return
		}

		allQuestions := append(aptitudeQuestions, codingQuestions...)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(allQuestions)
	}
}
