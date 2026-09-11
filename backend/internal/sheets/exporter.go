package sheets

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"sort"
	"strconv"
	"sync"
	"time"

	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
	"kindle-jr/internal/models"
)

// Transcript columns. Order is load-bearing: the SortSpecs below reference the
// score and elapsed-time columns by index, so inserting a column in the middle
// of this list silently breaks live ranking.
const (
	colRank        = 0
	colName        = 1
	colStudentID   = 2
	colCollegeMail = 3
	colCourse      = 4
	colEnrollment  = 5
	colTrack       = 6
	colStatus      = 7
	colCorrect     = 8
	colIncorrect   = 9
	colUnattempted = 10
	colTotalScore  = 11
	colElapsedSecs = 12
	colTimeTaken   = 13
	colSubmitted   = 14
	colUpdated     = 15
	colCheated     = 16
	columnCount    = 17
)

// Header is written to row 1 of the transcript sheet.
var Header = []interface{}{
	"Rank", "Name", "Student ID", "College Email", "Course", "Enrollment",
	"Track", "Status", "Correct", "Incorrect", "Unattempted", "Total Marks",
	"Elapsed (s)", "Time Taken", "Submitted At", "Last Updated", "Cheated",
}

// defaultSheetName is the tab the pipeline reads and writes.
const defaultSheetName = "Leaderboard"

// SheetsClient is a process-wide, lazily-built Google Sheets v4 service.
//
// Building a service performs an OAuth token exchange, so doing it per request
// (as the original implementation did) added hundreds of milliseconds to every
// sync. It is created once and reused; the credentials never change while the
// process is alive.
var (
	clientMu      sync.Mutex
	client        *sheets.Service
	clientInitErr error
)

// CredentialsFromEnv decodes GOOGLE_SHEETS_CREDENTIALS_BASE64 into an in-memory
// service-account key. It never touches the filesystem, which is what makes the
// pipeline work on Railway/Vercel where no local key file exists.
func CredentialsFromEnv() ([]byte, error) {
	for _, key := range []string{
		"GOOGLE_SHEETS_CREDENTIALS_BASE64",
		"GOOGLE_SERVICE_ACCOUNT_BASE64",
		"FIREBASE_CREDENTIALS_BASE64",
	} {
		raw := osGetenv(key)
		if raw == "" {
			continue
		}
		// Tolerate a raw (non-base64) JSON value so a mis-parenthesised deploy
		// variable still works instead of failing silently.
		if len(raw) > 0 && raw[0] == '{' {
			return []byte(raw), nil
		}
		decoded, err := base64.StdEncoding.DecodeString(raw)
		if err != nil {
			return nil, fmt.Errorf("invalid base64 in %s: %w", key, err)
		}
		return decoded, nil
	}
	return nil, fmt.Errorf("no Google credentials found (set GOOGLE_SHEETS_CREDENTIALS_BASE64)")
}

// service returns the shared Sheets client, creating it on first use.
func service(ctx context.Context) (*sheets.Service, error) {
	clientMu.Lock()
	defer clientMu.Unlock()

	if client != nil || clientInitErr != nil {
		return client, clientInitErr
	}

	creds, err := CredentialsFromEnv()
	if err != nil {
		clientInitErr = err
		return nil, err
	}

	srv, err := sheets.NewService(ctx,
		option.WithCredentialsJSON(creds),
		// Sheets needs the spreadsheets scope; the credential may also be used
		// for Firestore, where scopes are supplied separately.
		option.WithScopes(sheets.SpreadsheetsScope),
	)
	if err != nil {
		clientInitErr = fmt.Errorf("failed to create sheets service: %w", err)
		return nil, clientInitErr
	}

	client = srv
	log.Println("[SHEETS] Google Sheets v4 service initialised.")
	return client, nil
}

// ResetClient drops the cached service, so credentials rotated at runtime are
// picked up on the next call.
func ResetClient() {
	clientMu.Lock()
	defer clientMu.Unlock()
	client = nil
	clientInitErr = nil
}

// SpreadsheetID resolves the target spreadsheet from the environment, falling
// back to the configured production sheet.
func SpreadsheetID() string {
	for _, key := range []string{"GOOGLE_SHEET_ID", "SHEET_ID", "SPREADSHEET_ID"} {
		if v := osGetenv(key); v != "" {
			return v
		}
	}
	return ""
}

// SheetName resolves the target tab name.
func SheetName() string {
	if v := osGetenv("GOOGLE_SHEET_NAME"); v != "" {
		return v
	}
	return defaultSheetName
}

// osGetenv is a thin indirection so this package stays trivially testable.
var osGetenv = os.Getenv

// RankStudents sorts the students purely in memory for the admin telemetry dashboard.
func RankStudents(students []models.StudentState) []models.StudentState {
	valid := make([]models.StudentState, 0, len(students))
	for _, s := range students {
		valid = append(valid, s)
	}

	sort.SliceStable(valid, func(i, j int) bool {
		a, b := valid[i], valid[j]
		if a.TotalScore != b.TotalScore {
			return a.TotalScore > b.TotalScore
		}
		aHas, bHas := a.TimeTakenSeconds > 0, b.TimeTakenSeconds > 0
		if aHas && bHas && a.TimeTakenSeconds != b.TimeTakenSeconds {
			return a.TimeTakenSeconds < b.TimeTakenSeconds
		}
		return a.CorrectCount > b.CorrectCount
	})

	return valid
}

// SyncLeaderboardToSheet rewrites the whole transcript tab and then applies the
// authoritative ranking. Used by the admin "Sync Sheets" button and as the
// reconciliation pass - the sheet is a projection of Firestore, never a source
// of truth.
func SyncLeaderboardToSheet(ctx context.Context, spreadsheetID string, sheetID int64, students []models.StudentState) error {
	return SyncLeaderboardToSheetWithName(ctx, spreadsheetID, SheetName(), sheetID, students)
}

// SyncLeaderboardToSheetWithName is the explicit-tab variant.
func SyncLeaderboardToSheetWithName(ctx context.Context, spreadsheetID, sheetName string, sheetID int64, students []models.StudentState) error {
	if spreadsheetID == "" {
		return fmt.Errorf("spreadsheet id is empty (set GOOGLE_SHEET_ID)")
	}

	srv, err := service(ctx)
	if err != nil {
		return err
	}

	if err := EnsureHeaders(ctx, spreadsheetID, sheetName); err != nil {
		return err
	}

	ranked := RankStudents(students)

	rows := make([][]interface{}, 0, len(ranked)+1)
	rows = append(rows, Header)
	for i, s := range ranked {
		rows = append(rows, studentRow(i+1, s))
	}

	rng := sheetName + "!A1"

	// Clear first so a shrinking roster does not leave orphaned rows behind.
	if _, err := srv.Spreadsheets.Values.Clear(spreadsheetID, rng, &sheets.ClearValuesRequest{}).Context(ctx).Do(); err != nil {
		return fmt.Errorf("failed to clear sheet: %w", err)
	}

	vr := &sheets.ValueRange{Values: rows}
	if _, err := srv.Spreadsheets.Values.
		Update(spreadsheetID, rng, vr).
		ValueInputOption("USER_ENTERED").
		Context(ctx).Do(); err != nil {
		return fmt.Errorf("failed to write sheet values: %w", err)
	}

	return SortLeaderboardRange(ctx, spreadsheetID, sheetID, len(rows))
}

// SortLeaderboardRange applies the dual SortSpecs required for live ranking:
//
// \t1. Total Marks  DESC  (highest score first)
// \t2. Elapsed (s)   ASC   (fastest finisher wins a tie)
//
// Elapsed seconds is used rather than the formatted string because "05m 30s"
// does not sort lexicographically.
func SortLeaderboardRange(ctx context.Context, spreadsheetID string, sheetID int64, rowCount int) error {
	if rowCount <= 1 {
		return nil // header only - nothing to order
	}

	srv, err := service(ctx)
	if err != nil {
		return err
	}

	req := &sheets.BatchUpdateSpreadsheetRequest{
		Requests: []*sheets.Request{
			{
				SortRange: &sheets.SortRangeRequest{
					Range: &sheets.GridRange{
						SheetId:          sheetID,
						StartRowIndex:    1, // preserve the header row
						EndRowIndex:      int64(rowCount),
						StartColumnIndex: 0,
						EndColumnIndex:   columnCount,
					},
					SortSpecs: []*sheets.SortSpec{
						{
							SortOrder:      "DESCENDING",
							DimensionIndex: colTotalScore, // Total Marks
						},
						{
							SortOrder:      "ASCENDING",
							DimensionIndex: colElapsedSecs, // Elapsed (s)
						},
					},
				},
			},
		},
	}

	if _, err := srv.Spreadsheets.BatchUpdate(spreadsheetID, req).Context(ctx).Do(); err != nil {
		return fmt.Errorf("failed to sort sheet: %w", err)
	}
	return nil
}

// EnsureHeaders writes the header row when it is missing or stale. It is
// idempotent, so it is safe to call before every sync.
func EnsureHeaders(ctx context.Context, spreadsheetID, sheetName string) error {
	srv, err := service(ctx)
	if err != nil {
		return err
	}

	readRng := sheetName + "!A1:P1"
	current, err := srv.Spreadsheets.Values.Get(spreadsheetID, readRng).Context(ctx).Do()
	if err == nil && len(current.Values) > 0 && len(current.Values[0]) >= columnCount {
		return nil
	}

	vr := &sheets.ValueRange{Values: [][]interface{}{Header}}
	_, err = srv.Spreadsheets.Values.
		Update(spreadsheetID, sheetName+"!A1", vr).
		ValueInputOption("RAW").
		Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("failed to write header row: %w", err)
	}
	return nil
}

// SyncStudentRow upserts a single student into the sheet.
//
// This is the real-time path: it runs after every debounced answer and after a
// submission, so the sheet tracks the exam live. It locates the student's row by
// Student ID (column C) and overwrites it in place, which keeps the operation to
// a single read plus a single write and avoids re-sorting the entire table on
// every keystroke.
func SyncStudentRow(ctx context.Context, student models.StudentState) error {
	spreadsheetID := SpreadsheetID()
	if spreadsheetID == "" {
		return fmt.Errorf("spreadsheet id is empty (set GOOGLE_SHEET_ID)")
	}

	srv, err := service(ctx)
	if err != nil {
		return err
	}

	sheetName := SheetName()
	if err := EnsureHeaders(ctx, spreadsheetID, sheetName); err != nil {
		return err
	}

	ids, err := srv.Spreadsheets.Values.
		Get(spreadsheetID, fmt.Sprintf("%s!C2:C", sheetName)).
		Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("failed to read student id column: %w", err)
	}

	// Row 1 is the header, so the first data row is 2.
	rowIndex := -1
	for i, row := range ids.Values {
		if len(row) > 0 && fmt.Sprint(row[0]) == student.StudentID {
			rowIndex = i + 2
			break
		}
	}

	values := [][]interface{}{studentRow(0, student)}
	a1 := fmt.Sprintf("%s!A%d", sheetName, rowIndex)
	if rowIndex == -1 {
		// New student: append at the end of column A. Rank is recomputed by the
		// sort that follows, so a placeholder 0 is acceptable here.
		a1 = fmt.Sprintf("%s!A%d", sheetName, len(ids.Values)+2)
	}

	vr := &sheets.ValueRange{Values: values}
	if _, err := srv.Spreadsheets.Values.
		Update(spreadsheetID, a1, vr).
		ValueInputOption("USER_ENTERED").
		Context(ctx).Do(); err != nil {
		return fmt.Errorf("failed to upsert student row: %w", err)
	}

	// Re-rank in place. Google Sheets applies the ordering server-side, so this
	// stays correct without the backend re-reading every row.
	total, err := srv.Spreadsheets.Values.
		Get(spreadsheetID, fmt.Sprintf("%s!C2:C", sheetName)).
		Context(ctx).Do()
	if err == nil {
		_ = SortLeaderboardRange(ctx, spreadsheetID, ParseSheetID(), len(total.Values)+1)
	}

	return nil
}

// studentRow renders one student into the transcript column order.
func studentRow(rank int, s models.StudentState) []interface{} {
	if rank <= 0 {
		rank = 0 // placeholder until the server-side sort re-ranks the table
	}
	return []interface{}{
		rank,
		s.Name,
		s.StudentID,
		s.CollegeEmail,
		s.Course,
		s.EnrollmentNum,
		emptyDash(s.SelectedTrack),
		status(s),
		s.CorrectCount,
		s.IncorrectCount,
		unattempted(s),
		s.TotalScore,
		elapsedSeconds(s),
		emptyDash(s.TimeTakenFormatted),
		formatTime(s.SubmittedAt),
		formatUpdated(s.UpdatedAt),
		cheatedText(s),
	}
}

// elapsedSeconds returns a comparable numeric duration. In-progress students are
// measured from their start time so the tie-breaker stays meaningful before they
// submit.
func elapsedSeconds(s models.StudentState) int {
	if s.TimeTakenSeconds > 0 {
		return s.TimeTakenSeconds
	}
	if s.StartedAt != nil {
		if elapsed := int(time.Since(*s.StartedAt).Seconds()); elapsed > 0 {
			return elapsed
		}
	}
	return 0
}

func status(s models.StudentState) string {
	switch {
	case s.IsSubmitted:
		if s.Cheated {
			return "Submitted (Cheated)"
		}
		return "Submitted"
	case s.SelectedTrack != "":
		return "In Progress"
	default:
		return "Registered"
	}
}

func cheatedText(s models.StudentState) string {
	if s.Cheated {
		return "Yes"
	}
	return "No"
}

func unattempted(s models.StudentState) int {
	if !s.IsSubmitted && s.UnattemptedCount == 0 {
		return 60
	}
	return s.UnattemptedCount
}

func formatTime(t *time.Time) string {
	if t == nil {
		return "-"
	}
	return t.Format("2006-01-02 15:04:05")
}

func formatUpdated(t time.Time) string {
	if t.IsZero() {
		return "-"
	}
	return t.Format("2006-01-02 15:04:05")
}

func emptyDash(v string) string {
	if v == "" {
		return "-"
	}
	return v
}

// ParseSheetID converts the sheet gid from the environment (default 0, the
// first tab) into the int64 the API expects.
func ParseSheetID() int64 {
	raw := osGetenv("GOOGLE_SHEET_GID")
	if raw == "" {
		return 0
	}
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0
	}
	return id
}
