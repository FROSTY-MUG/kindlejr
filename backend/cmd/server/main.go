package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/gorilla/mux"

	"kindle-jr/internal/config"
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

	// Load .env (best-effort) so local runs pick up FIREBASE_PROJECT_ID,
	// ADMIN_SECRET and the service-account credentials without manual export.
	config.LoadDotEnv(".env", filepath.Join("..", ".env"))

	// Initialize Firestore via Firebase Admin SDK. InitFirestore never returns
	// an error - it degrades to the resilient local store so the exam always runs.
	store := db.InitFirestore(dataPath)
	defer store.Close()
	backend, reason := store.Snapshot()
	log.Printf("[INIT] Persistence backend: %s (%s)", backend, reason)

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
	r.HandleFunc("/api/admin/late-submissions", handlers.GetLateSubmissions(store)).Methods("GET", "OPTIONS")
	r.HandleFunc("/api/admin/sync-sheets", handlers.SyncSheets(store)).Methods("GET", "POST", "OPTIONS")

	// Health Check
	r.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		currentBackend, currentReason := store.Snapshot()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "ok",
			"service":   "kindle-jr-backend",
			"backend":   currentBackend,
			"reason":    currentReason,
			"firestore": store.UsingFirestore(),
			"sheets":    sheets.SpreadsheetID() != "",
		})
	}).Methods("GET", "OPTIONS")

	server := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Serve in a goroutine so the main goroutine can wait for SIGTERM/SIGINT and
	// shut down gracefully - flushing the debounced file mirror and draining any
	// in-flight Firestore writes before the process exits.
	go func() {
		log.Printf("Kindle Jr 5.0 Go Engine listening on 0.0.0.0:%s", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	log.Println("[SHUTDOWN] Signal received - draining connections and flushing state...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("[SHUTDOWN] HTTP shutdown error: %v", err)
	}
	store.FlushLocal()
	store.Wait()
	log.Println("[SHUTDOWN] State persisted. Goodbye.")
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Admin-Key, Cache-Control, Accept")
		w.Header().Set("Access-Control-Max-Age", "86400")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
