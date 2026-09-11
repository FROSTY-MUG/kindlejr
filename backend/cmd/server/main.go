package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gorilla/mux"

	"kindle-jr/internal/db"
	"kindle-jr/internal/handlers"
	"kindle-jr/internal/sheets"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dataPath := os.Getenv("DATA_PATH")
	if dataPath == "" {
		dataPath = "./data"
		if _, err := os.Stat(dataPath); os.IsNotExist(err) {
			dataPath = filepath.Join("..", "..", "data")
		}
	}

	log.Println("[INIT] Starting Kindle Jr 5.0 Production Backend...")

	// Initialize Firestore via Firebase Admin SDK
	store, err := db.InitFirestore()
	if err != nil {
		log.Fatalf("Firestore init error: %v", err)
	}
	defer store.Close()

	// Initialize Google Sheets headers on startup (non-blocking)
	go func() {
		if err := sheets.EnsureHeaders(context.Background()); err != nil {
			log.Printf("[WARN] Sheets header initialization failed: %v", err)
		}
	}()

	r := mux.NewRouter()
	r.Use(corsMiddleware)

	// Student API Endpoints
	r.HandleFunc("/api/register", handlers.RegisterStudent(store)).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/init-quiz", handlers.InitQuiz(store)).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/save-answer", handlers.RealTimeAutoSaveAnswer(store, dataPath)).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/state/{studentId}", handlers.GetState(store)).Methods("GET", "OPTIONS")
	r.HandleFunc("/api/questions/{track}", handlers.GetQuestions(dataPath)).Methods("GET", "OPTIONS")
	r.HandleFunc("/api/submit", handlers.SubmitQuiz(store, dataPath)).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/webhook/google-forms", handlers.IngestGoogleForms(store)).Methods("POST", "OPTIONS")

	// Admin Endpoints (protected by X-Admin-Key header)
	r.HandleFunc("/api/admin/leaderboard", handlers.GetLeaderboard(store)).Methods("GET", "OPTIONS")
	r.HandleFunc("/api/admin/export-sheets", handlers.ExportSheets(store)).Methods("POST", "OPTIONS")

	// Health Check
	r.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"kindle-jr-backend","firebase":true,"sheetsExport":true}`))
	}).Methods("GET", "OPTIONS")

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("Kindle Jr 5.0 Go Engine listening on 0.0.0.0:%s", port)
	log.Fatal(server.ListenAndServe())
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Admin-Key")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
