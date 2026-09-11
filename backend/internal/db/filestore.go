package db

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"kindle-jr/internal/models"
)

// FileStore is the resilient fallback persistence layer. It is used whenever
// Cloud Firestore is unreachable or unauthenticated, guaranteeing the exam can
// still run end-to-end. Data is written as JSON to disk (best-effort, so it
// survives restarts) and mirrored in memory for fast reads.
type FileStore struct {
	mu       sync.RWMutex
	students map[string]*models.StudentState
	late     map[string]*models.LateSubmission
	filePath string
	latePath string
	// Disk writes are debounced. Rewriting the whole JSON file on every
	// keystroke was the single largest source of latency in the old design;
	// the in-memory map is always authoritative for reads and the file is
	// flushed at most every flushInterval, plus once on shutdown.
	dirty    bool
	flushReq chan struct{}
}

// flushInterval bounds how stale the on-disk mirror may become.
const flushInterval = 2 * time.Second

// NewFileStore loads any previously persisted state from disk.
func NewFileStore(dataDir string) *FileStore {
	if dataDir == "" {
		dataDir = "."
	}
	_ = os.MkdirAll(dataDir, 0o755)

	fs := &FileStore{
		students: make(map[string]*models.StudentState),
		late:     make(map[string]*models.LateSubmission),
		filePath: filepath.Join(dataDir, "store_cache.json"),
		latePath: filepath.Join(dataDir, "late_cache.json"),
		flushReq: make(chan struct{}, 1),
	}

	fs.loadLocked(fs.filePath, &fs.students)
	fs.loadLocked(fs.latePath, &fs.late)
	log.Printf("[FALLBACK] Resilient file/in-memory store ready (students=%d).", len(fs.students))

	go fs.flushLoop()
	return fs
}

// flushLoop periodically persists dirty state and reacts to an explicit flush
// request, so writes are batched instead of performed inline.
func (f *FileStore) flushLoop() {
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			f.Flush()
		case <-f.flushReq:
			f.Flush()
		}
	}
}

// markDirty records that the on-disk copy is stale and nudges the flush loop.
// Callers must hold at least a read lock on the maps' owning mutex semantics;
// in practice it is only called while holding the write lock.
func (f *FileStore) markDirtyLocked() {
	f.dirty = true
	select {
	case f.flushReq <- struct{}{}:
	default:
	}
}

// Flush writes the current state to disk if it has changed. Safe to call
// concurrently and idempotent when nothing is dirty.
func (f *FileStore) Flush() {
	f.mu.Lock()
	defer f.mu.Unlock()
	if !f.dirty {
		return
	}
	f.persistLocked()
	f.dirty = false
}

func (f *FileStore) loadLocked(path string, dest interface{}) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		log.Printf("[FALLBACK] Could not parse %s: %v", path, err)
	}
}

// persistLocked writes the in-memory maps to disk. Callers must hold the lock.
func (f *FileStore) persistLocked() {
	if raw, err := json.MarshalIndent(f.students, "", "  "); err == nil {
		_ = os.WriteFile(f.filePath, raw, 0o644)
	}
	if raw, err := json.MarshalIndent(f.late, "", "  "); err == nil {
		_ = os.WriteFile(f.latePath, raw, 0o644)
	}
}

func (f *FileStore) GetStudent(_ context.Context, id string) (*models.StudentState, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	st, ok := f.students[id]
	if !ok {
		return nil, os.ErrNotExist
	}
	clone := *st
	return &clone, nil
}

// ApplyUpdates merges arbitrary field updates onto an existing student record,
// creating it on first write. This mirrors Firestore's MergeAll semantics.
func (f *FileStore) ApplyUpdates(_ context.Context, id string, updates map[string]interface{}) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	st, ok := f.students[id]
	if !ok {
		st = &models.StudentState{StudentID: id, Answers: make(map[string]string)}
		f.students[id] = st
	}
	applyMapToStudent(st, updates)
	f.markDirtyLocked()
	return nil
}

func (f *FileStore) GetAllStudents(_ context.Context) ([]models.StudentState, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	out := make([]models.StudentState, 0, len(f.students))
	for _, st := range f.students {
		out = append(out, *st)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StudentID < out[j].StudentID })
	return out, nil
}

func (f *FileStore) AddLateSubmission(_ context.Context, ls *models.LateSubmission) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	clone := *ls
	f.late[ls.StudentID] = &clone
	f.markDirtyLocked()
	return nil
}

func (f *FileStore) GetLateSubmissions(_ context.Context) ([]models.LateSubmission, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	out := make([]models.LateSubmission, 0, len(f.late))
	for _, ls := range f.late {
		out = append(out, *ls)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].RecordedAt.Before(out[j].RecordedAt) })
	return out, nil
}

// applyMapToStudent maps the shared update keys (used by both Firestore and the
// file store) onto a typed StudentState. Only recognised keys are applied so
// unexpected fields are ignored rather than silently corrupting state.
func applyMapToStudent(st *models.StudentState, updates map[string]interface{}) {
	for k, v := range updates {
		switch k {
		case "studentId":
			st.StudentID = toString(v)
		case "name":
			st.Name = toString(v)
		case "personalEmail":
			st.PersonalEmail = toString(v)
		case "collegeEmail":
			st.CollegeEmail = toString(v)
		case "course":
			st.Course = toString(v)
		case "enrollmentNum":
			st.EnrollmentNum = toString(v)
		case "selectedTrack":
			st.SelectedTrack = toString(v)
		case "registeredAt":
			st.RegisteredAt = toTimePtr(v)
		case "startedAt":
			st.StartedAt = toTimePtr(v)
		case "currentQuestion":
			st.CurrentQuestion = toInt(v)
		case "shuffledOrder":
			st.ShuffledOrder = toIntSlice(v)
		case "answers":
			st.Answers = toStringMap(v)
		case "isSubmitted":
			st.IsSubmitted = toBool(v)
		case "totalScore":
			st.TotalScore = toInt(v)
		case "correctCount":
			st.CorrectCount = toInt(v)
		case "incorrectCount":
			st.IncorrectCount = toInt(v)
		case "unattemptedCount":
			st.UnattemptedCount = toInt(v)
		case "timeTakenSeconds":
			st.TimeTakenSeconds = toInt(v)
		case "timeTakenFormatted":
			st.TimeTakenFormatted = toString(v)
		case "submittedAt":
			st.SubmittedAt = toTimePtr(v)
		case "updatedAt":
			if t := toTimePtr(v); t != nil {
				st.UpdatedAt = *t
			}
		}
		if len(k) > 8 && k[:8] == "answers." {
			if st.Answers == nil {
				st.Answers = make(map[string]string)
			}
			st.Answers[k[8:]] = toString(v)
		}
	}
	if st.Answers == nil {
		st.Answers = make(map[string]string)
	}
}

func toString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func toStringMap(v interface{}) map[string]string {
	out := make(map[string]string)
	switch m := v.(type) {
	case map[string]string:
		for k, val := range m {
			out[k] = val
		}
	case map[string]interface{}:
		for k, val := range m {
			out[k] = toString(val)
		}
	}
	return out
}

func toTimePtr(v interface{}) *time.Time {
	switch t := v.(type) {
	case time.Time:
		tt := t
		return &tt
	case *time.Time:
		return t
	case string:
		if parsed, err := time.Parse(time.RFC3339, t); err == nil {
			return &parsed
		}
	}
	return nil
}

func toInt(v interface{}) int {
	switch n := v.(type) {
	case int:
		return n
	case int64:
		return int(n)
	case float64:
		return int(n)
	}
	return 0
}

func toIntSlice(v interface{}) []int {
	switch s := v.(type) {
	case []int:
		return s
	case []interface{}:
		out := make([]int, 0, len(s))
		for _, item := range s {
			out = append(out, toInt(item))
		}
		return out
	}
	return nil
}

func toBool(v interface{}) bool {
	b, _ := v.(bool)
	return b
}
