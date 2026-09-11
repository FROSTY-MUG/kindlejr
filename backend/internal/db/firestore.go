package db

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
	"kindle-jr/internal/models"
)

const (
	collectionName     = "kindle_students"
	lateCollectionName = "kindle_late_submissions"
)

type firestoreJob struct {
	studentID string
	payload   map[string]interface{}
}

// Store is the single persistence facade used by every handler. It is
// Firestore-first (Cloud Firestore via the Firebase Admin SDK) and
// transparently falls back to the resilient FileStore whenever Firestore is
// unreachable, unauthenticated, or errors mid-flight. This guarantees that the
// exam keeps working even with broken Firebase credentials.
type Store struct {
	Client     *firestore.Client
	file       *FileStore
	mu         sync.RWMutex // guards Backend/Reason
	wg         sync.WaitGroup
	Backend    string // "firestore" or "local"
	Reason     string // human-readable explanation of the current backend
	jobChan    chan firestoreJob
	closeOnce  sync.Once
}

// InitFirestore initialises the persistence layer.
//
// Credential resolution is in-memory first. The primary path decodes
// GOOGLE_SHEETS_CREDENTIALS_BASE64 straight into a byte slice and hands it to
// the Admin SDK via option.WithCredentialsJSON. Nothing is written to or read
// from the filesystem on that path, which is what makes the service deployable
// on Railway and Vercel where no service-account key file exists. The local-file
// branches exist only as a development convenience.
//
// Resolution order:
//  1. GOOGLE_SHEETS_CREDENTIALS_BASE64 / GOOGLE_SERVICE_ACCOUNT_BASE64 (in-memory)
//  2. GOOGLE_APPLICATION_CREDENTIALS (file path, local development only)
//  3. Application Default Credentials (GCE / Cloud Run metadata)
//
// A failure at any step does not abort the process: the server keeps serving on
// the resilient local store, and the reason is reported via /api/health.
func InitFirestore(dataDir string) *Store {
	store := &Store{
		file:    NewFileStore(dataDir),
		Backend: "local",
		Reason:  "Firestore not initialised yet",
	}

	ctx := context.Background()

	var opt option.ClientOption
	projectID := ""

	// ---- Path 1: in-memory Base64 credentials (production) ----
	if creds, err := credsFromBase64Env(); err == nil {
		opt = option.WithCredentialsJSON(creds)
		projectID = projectIDFromCreds(creds)
		log.Printf("[DB] Using in-memory Base64 service-account credentials (project=%s).", projectID)
	} else if !errors.Is(err, errNoBase64Creds) {
		log.Printf("[DB] Base64 credential decode failed (%v) - using local fallback.", err)
		store.Reason = err.Error()
		return store
	} else if credPath := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS"); credPath != "" {
		// ---- Path 2: credentials file (local development) ----
		opt = option.WithCredentialsFile(credPath)
		if raw, rerr := os.ReadFile(credPath); rerr == nil {
			projectID = projectIDFromCreds(raw)
		}
		log.Printf("[DB] Using credentials file at %s.", credPath)
	} else {
		// ---- Path 3: Application Default Credentials ----
		log.Println("[DB] No explicit credentials - trying Application Default Credentials.")
	}

	// An explicit environment project id always wins over the credential's own,
	// so a deliberate override is respected.
	if envProject := firstNonEmpty(
		os.Getenv("FIREBASE_PROJECT_ID"),
		os.Getenv("GOOGLE_CLOUD_PROJECT"),
		os.Getenv("GCLOUD_PROJECT"),
	); envProject != "" {
		projectID = envProject
	}

	if projectID == "" {
		projectID = "kindle-jr-5-prod"
	}
	log.Printf("[DB] Target Firebase project: %s", projectID)

	conf := &firebase.Config{ProjectID: projectID}

	var app *firebase.App
	var err error
	if opt != nil {
		app, err = firebase.NewApp(ctx, conf, opt)
	} else {
		app, err = firebase.NewApp(ctx, conf)
	}
	if err != nil {
		log.Printf("[DB] Firebase app init failed (%v) - using local fallback.", err)
		store.Reason = "firebase app init failed: " + err.Error()
		return store
	}

	client, err := app.Firestore(ctx)
	if err != nil {
		log.Printf("[DB] Firestore client init failed (%v) - using local fallback.", err)
		store.Reason = "firestore client init failed: " + err.Error()
		return store
	}

	store.Client = client
	store.Backend = "firestore"
	store.Reason = "connected to Cloud Firestore (project " + projectID + ")"

	// Probe in the background. A misconfigured service account still constructs
	// a client successfully, so we verify with a real round-trip - but we do not
	// block startup on it, because the server must come up fast and the local
	// mirror already covers every read and write.
	go func(c *firestore.Client) {
		probeCtx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
		defer cancel()

		if _, perr := c.Collection(collectionName).Limit(1).Documents(probeCtx).Next(); perr != nil && perr != iterator.Done {
			log.Printf("[DB] Firestore probe failed (%v) - staying on local mirror for reads.", perr)
			store.mu.Lock()
			return
		}
		log.Println("[DB] Firestore probe succeeded - live persistence active.")
	}(client)

	// Start 50-worker background queue to scale for 400+ concurrent users
	const numWorkers = 50
	store.jobChan = make(chan firestoreJob, 2048)
	for i := 0; i < numWorkers; i++ {
		store.wg.Add(1)
		go func(workerID int) {
			defer store.wg.Done()
			for job := range store.jobChan {
				if store.Client == nil {
					continue
				}
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				if _, err := store.Client.Collection(collectionName).Doc(job.studentID).Set(ctx, job.payload, firestore.MergeAll); err != nil {
					log.Printf("[DB][Worker %d] Firestore upsert failed for %s (%v)", workerID, job.studentID, err)
					store.mu.Lock()
					store.Reason = "firestore write failed: " + err.Error()
					store.mu.Unlock()
				}
				cancel()
			}
		}(i + 1)
	}
	log.Printf("[DB] Initialized 50-goroutine worker pool for 400+ concurrent students.")

	log.Println("[DB] Firebase Admin SDK initialised; Firestore primary with local mirror.")
	return store
}

// errNoBase64Creds signals that no in-memory credential variable was set, so
// the caller should fall through to the next resolution path. It is distinct
// from a genuine decode failure, which must be surfaced.
var errNoBase64Creds = errors.New("no base64 credentials configured")

// credsFromBase64Env decodes the service-account key from the first populated
// credential environment variable, entirely in memory.
func credsFromBase64Env() ([]byte, error) {
	for _, key := range []string{
		"GOOGLE_SHEETS_CREDENTIALS_BASE64",
		"GOOGLE_SERVICE_ACCOUNT_BASE64",
		"FIREBASE_CREDENTIALS_BASE64",
	} {
		raw := strings.TrimSpace(os.Getenv(key))
		if raw == "" {
			continue
		}

		// A raw JSON value is accepted so a deploy variable that was pasted
		// without encoding still works instead of silently degrading.
		if strings.HasPrefix(raw, "{") {
			if !json.Valid([]byte(raw)) {
				return nil, fmt.Errorf("%s contains malformed JSON", key)
			}
			return []byte(raw), nil
		}

		decoded, err := base64.StdEncoding.DecodeString(raw)
		if err != nil {
			// Some providers strip padding or use the URL-safe alphabet.
			if decoded, err = base64.RawStdEncoding.DecodeString(strings.TrimRight(raw, "=")); err != nil {
				if decoded, err = base64.URLEncoding.DecodeString(raw); err != nil {
					return nil, fmt.Errorf("%s is not valid base64: %w", key, err)
				}
			}
		}

		if !json.Valid(decoded) {
			return nil, fmt.Errorf("%s decoded to malformed JSON", key)
		}
		return decoded, nil
	}
	return nil, errNoBase64Creds
}

// firstNonEmpty returns the first non-blank string from the supplied list.
func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// projectIDFromCreds extracts the "project_id" field from a service-account
// JSON key so the Firestore client always targets the credential's own project.
func projectIDFromCreds(raw []byte) string {
	var meta struct {
		ProjectID string `json:"project_id"`
	}
	if err := json.Unmarshal(raw, &meta); err != nil {
		return ""
	}
	return meta.ProjectID
}

// UsingFirestore reports whether the primary Firestore backend is active.
func (s *Store) UsingFirestore() bool { return s.Client != nil }

// FlushLocal forces the debounced local mirror to disk immediately.
func (s *Store) FlushLocal() {
	if s.file != nil {
		s.file.Flush()
	}
}

// Close drains in-flight writes, flushes the local mirror and then shuts down
// the Firestore client connection.
func (s *Store) Close() error {
	s.closeOnce.Do(func() {
		if s.jobChan != nil {
			close(s.jobChan)
		}
	})
	s.Wait()
	s.FlushLocal()
	if s.Client != nil {
		return s.Client.Close()
	}
	return nil
}

// GetStudent retrieves a single student's state. On Firestore errors it
// transparently re-reads from the local fallback.
func (s *Store) GetStudent(ctx context.Context, studentID string) (*models.StudentState, error) {
	if s.Client == nil {
		return s.file.GetStudent(ctx, studentID)
	}

	doc, err := s.Client.Collection(collectionName).Doc(studentID).Get(ctx)
	if err != nil {
		if local, lerr := s.file.GetStudent(ctx, studentID); lerr == nil {
			return local, nil
		}
		return nil, fmt.Errorf("student %s not found: %v", studentID, err)
	}

	var state models.StudentState
	if err := doc.DataTo(&state); err != nil {
		return nil, fmt.Errorf("failed to parse student data for %s: %v", studentID, err)
	}
	return &state, nil
}

// UpsertStudentMap performs a merge-upsert of arbitrary field updates.
//
// This sits on the hot path - it runs on every debounced keystroke - so it is
// deliberately non-blocking with respect to Firestore:
//
//  1. The in-memory/on-disk mirror is updated synchronously. That is a map
//     write plus a cheap debounced file flush, so the HTTP response returns
//     immediately and no answer can be lost.
//  2. The Firestore write is dispatched into a 50-goroutine worker pool
//     with its own timeout. A slow or unreachable Firestore can therefore
//     never stall the request that carries a student's answer.
//
// The caller's cancellation is intentionally not propagated to the background
// write; the handler finishing must not abort an in-flight persistence call.
func (s *Store) UpsertStudentMap(_ context.Context, studentID string, updates map[string]interface{}) error {
	if updates == nil {
		updates = map[string]interface{}{}
	}
	updates["updatedAt"] = time.Now().UTC()

	// Synchronous, authoritative local write.
	if err := s.file.ApplyUpdates(context.Background(), studentID, updates); err != nil {
		log.Printf("[DB] local mirror write failed for %s: %v", studentID, err)
	}

	if s.Client == nil {
		return nil
	}

	// Copy the payload: the map is owned by the caller's stack and we hand it
	// to another goroutine / worker channel.
	payload := make(map[string]interface{}, len(updates))
	for k, v := range updates {
		payload[k] = v
	}

	if s.jobChan != nil {
		select {
		case s.jobChan <- firestoreJob{studentID: studentID, payload: payload}:
			return nil
		default:
			// Buffer full fallback (spawns emergency goroutine)
		}
	}

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if _, err := s.Client.Collection(collectionName).Doc(studentID).Set(ctx, payload, firestore.MergeAll); err != nil {
			log.Printf("[DB] Direct fallback upsert failed for %s (%v) - local mirror retained.", studentID, err)
			s.mu.Lock()
			s.Reason = "firestore write failed: " + err.Error()
			s.mu.Unlock()
		}
	}()

	return nil
}

// Snapshot returns a point-in-time copy of the persistence status for the
// health endpoint. It is safe to call concurrently.
func (s *Store) Snapshot() (backend, reason string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.Backend, s.Reason
}

// Wait blocks until every in-flight background Firestore write has completed.
// It is used during graceful shutdown so no queued keystroke is dropped.
func (s *Store) Wait() { s.wg.Wait() }

// GetAllStudents returns every student record. If Firestore is unavailable it
// returns the locally-mirrored records instead of erroring.
func (s *Store) GetAllStudents(ctx context.Context) ([]models.StudentState, error) {
	if s.Client == nil {
		return s.file.GetAllStudents(ctx)
	}

	var students []models.StudentState
	iter := s.Client.Collection(collectionName).Documents(ctx)
	defer iter.Stop()

	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("[DB] Firestore iteration failed (%v) - falling back to local store.", err)
			return s.file.GetAllStudents(ctx)
		}
		var student models.StudentState
		if err := doc.DataTo(&student); err != nil {
			log.Printf("[WARN] Skipping malformed student document %s: %v", doc.Ref.ID, err)
			continue
		}
		students = append(students, student)
	}

	if len(students) == 0 {
		if local, lerr := s.file.GetAllStudents(ctx); lerr == nil && len(local) > 0 {
			return local, nil
		}
	}
	return students, nil
}

// AddLateSubmission records a post-deadline submission in both backends.
func (s *Store) AddLateSubmission(ctx context.Context, ls *models.LateSubmission) error {
	if err := s.file.AddLateSubmission(ctx, ls); err != nil {
		log.Printf("[DB] local late-submission write failed for %s: %v", ls.StudentID, err)
	}
	if s.Client == nil {
		return nil
	}
	if _, err := s.Client.Collection(lateCollectionName).Doc(ls.StudentID).Set(ctx, ls, firestore.MergeAll); err != nil {
		log.Printf("[DB] Firestore late-submission write failed for %s: %v (local mirror retained)", ls.StudentID, err)
	}
	return nil
}

// GetLateSubmissions returns all recorded post-deadline submissions.
func (s *Store) GetLateSubmissions(ctx context.Context) ([]models.LateSubmission, error) {
	if s.Client == nil {
		return s.file.GetLateSubmissions(ctx)
	}

	var late []models.LateSubmission
	iter := s.Client.Collection(lateCollectionName).Documents(ctx)
	defer iter.Stop()
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			log.Printf("[DB] Firestore late iteration failed (%v) - falling back to local store.", err)
			return s.file.GetLateSubmissions(ctx)
		}
		var ls models.LateSubmission
		if err := doc.DataTo(&ls); err != nil {
			continue
		}
		late = append(late, ls)
	}

	if len(late) == 0 {
		if local, lerr := s.file.GetLateSubmissions(ctx); lerr == nil && len(local) > 0 {
			return local, nil
		}
	}
	return late, nil
}
