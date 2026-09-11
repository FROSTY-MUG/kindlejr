package sheets

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"sort"
	"strconv"
	"strings"

	"google.golang.org/api/option"
	"google.golang.org/api/sheets/v4"
	"kindle-jr/internal/models"
)

// getSheetsService creates a Google Sheets API service from Base64-encoded credentials.
// Returns nil service if configuration is missing (log-only mock mode).
func getSheetsService(ctx context.Context) (*sheets.Service, string, error) {
	spreadsheetID := os.Getenv("GOOGLE_SHEET_ID")
	base64Creds := os.Getenv("GOOGLE_SHEETS_CREDENTIALS_BASE64")

	if spreadsheetID == "" || base64Creds == "" {
		return nil, "", fmt.Errorf("missing GOOGLE_SHEET_ID or GOOGLE_SHEETS_CREDENTIALS_BASE64 — Sheets exporter running in mock mode")
	}

	creds, err := base64.StdEncoding.DecodeString(base64Creds)
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode GOOGLE_SHEETS_CREDENTIALS_BASE64: %v", err)
	}

	srv, err := sheets.NewService(ctx, option.WithCredentialsJSON(creds))
	if err != nil {
		return nil, "", fmt.Errorf("failed to create Sheets service: %v", err)
	}

	return srv, spreadsheetID, nil
}

// EnsureHeaders checks if the header row exists in Sheet1!A1:M1 and creates it if absent.
// Should be called once on server startup.
func EnsureHeaders(ctx context.Context) error {
	srv, spreadsheetID, err := getSheetsService(ctx)
	if err != nil {
		log.Printf("[SHEETS] %v", err)
		return nil // Non-fatal: mock mode
	}

	headers := []interface{}{
		"Timestamp", "Name", "Personal Email", "College Email", "Course",
		"Student ID", "Enrollment Num", "Track", "Correct", "Incorrect",
		"Unattempted", "Total Score", "Rank",
	}

	// Check if headers already exist
	resp, err := srv.Spreadsheets.Values.Get(spreadsheetID, "Sheet1!A1:M1").Context(ctx).Do()
	if err != nil || len(resp.Values) == 0 || len(resp.Values[0]) == 0 {
		log.Println("[SHEETS] Header row not found. Initializing Sheet1 headers...")
		valueRange := &sheets.ValueRange{Values: [][]interface{}{headers}}
		_, err = srv.Spreadsheets.Values.Update(spreadsheetID, "Sheet1!A1:M1", valueRange).
			ValueInputOption("USER_ENTERED").Context(ctx).Do()
		if err != nil {
			log.Printf("[ERROR] Failed to write header row: %v", err)
			return err
		}
		log.Println("[SHEETS] Header row initialized successfully.")
	} else {
		log.Println("[SHEETS] Header row already exists. Skipping initialization.")
	}

	return nil
}

// AppendAndSortRankings appends a student score row, parses the actual row index
// from the Sheets API response, and triggers a descending sort by Total Score.
func AppendAndSortRankings(ctx context.Context, rowData []interface{}) error {
	srv, spreadsheetID, err := getSheetsService(ctx)
	if err != nil {
		// Mock mode: log and return
		log.Printf("[MOCK SHEETS] Score row: %v", rowData)
		return nil
	}

	// 1. Append the row
	valueRange := &sheets.ValueRange{Values: [][]interface{}{rowData}}
	appendResp, err := srv.Spreadsheets.Values.Append(spreadsheetID, "Sheet1!A:M", valueRange).
		ValueInputOption("USER_ENTERED").
		InsertDataOption("INSERT_ROWS").
		Context(ctx).
		Do()
	if err != nil {
		log.Printf("[ERROR] Failed to append row to Google Sheets: %v", err)
		return err
	}

	// 2. Parse actual row index from UpdatedRange (e.g. "Sheet1!A21:M21")
	rowIndex := 2 // safe fallback
	if appendResp.Updates != nil && appendResp.Updates.UpdatedRange != "" {
		updatedRange := appendResp.Updates.UpdatedRange
		parts := strings.Split(updatedRange, "!")
		if len(parts) == 2 {
			rangeParts := strings.Split(parts[1], ":")
			rowStr := strings.TrimLeft(rangeParts[0], "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
			if parsedRow, parseErr := strconv.Atoi(rowStr); parseErr == nil {
				rowIndex = parsedRow
			}
		}
		log.Printf("[SHEETS] Appended row at index %d (range: %s)", rowIndex, updatedRange)
	}

	// 3. Auto-sort by Total Score (Column L / index 11) descending, tie-break by Correct Count (Column I / index 8)
	sortReq := &sheets.BatchUpdateSpreadsheetRequest{
		Requests: []*sheets.Request{
			{
				SortRange: &sheets.SortRangeRequest{
					Range: &sheets.GridRange{
						SheetId:          0, // Default Sheet1
						StartRowIndex:    1, // Skip header row (index 0)
						StartColumnIndex: 0,
						EndColumnIndex:   13,
					},
					SortSpecs: []*sheets.SortSpec{
						{DimensionIndex: 11, SortOrder: "DESCENDING"}, // Total Score
						{DimensionIndex: 8, SortOrder: "DESCENDING"},  // Correct Count (tie-breaker)
					},
				},
			},
		},
	}

	_, sortErr := srv.Spreadsheets.BatchUpdate(spreadsheetID, sortReq).Context(ctx).Do()
	if sortErr != nil {
		log.Printf("[WARN] Auto-sort BatchUpdate failed: %v", sortErr)
	} else {
		log.Println("[SHEETS] Leaderboard auto-ranked descending by Total Score.")
	}

	return nil
}

// BulkExportStudents clears existing data rows and writes all students sorted by score
// with computed rank. Used by the admin /api/admin/export-sheets endpoint.
func BulkExportStudents(ctx context.Context, students []models.StudentState) error {
	srv, spreadsheetID, err := getSheetsService(ctx)
	if err != nil {
		log.Printf("[SHEETS BULK] %v", err)
		return err
	}

	// Sort by TotalScore desc, tie-break by CorrectCount desc
	sort.Slice(students, func(i, j int) bool {
		if students[i].TotalScore == students[j].TotalScore {
			return students[i].CorrectCount > students[j].CorrectCount
		}
		return students[i].TotalScore > students[j].TotalScore
	})

	var rows [][]interface{}
	for i, s := range students {
		timestamp := s.UpdatedAt.Format("2006-01-02 15:04:05")
		rows = append(rows, []interface{}{
			timestamp,
			s.Name,
			s.PersonalEmail,
			s.CollegeEmail,
			s.Course,
			s.StudentID,
			s.EnrollmentNum,
			s.SelectedTrack,
			s.CorrectCount,
			s.IncorrectCount,
			s.UnattemptedCount,
			s.TotalScore,
			i + 1, // Rank (1-based)
		})
	}

	// Clear existing data rows (preserve header row A1:M1)
	_, err = srv.Spreadsheets.Values.Clear(spreadsheetID, "Sheet1!A2:M", &sheets.ClearValuesRequest{}).
		Context(ctx).Do()
	if err != nil {
		log.Printf("[WARN] Failed to clear existing data rows: %v", err)
	}

	if len(rows) == 0 {
		log.Println("[SHEETS BULK] No students to export.")
		return nil
	}

	// Write all rows starting from A2
	valueRange := &sheets.ValueRange{Values: rows}
	_, err = srv.Spreadsheets.Values.Update(spreadsheetID, "Sheet1!A2", valueRange).
		ValueInputOption("USER_ENTERED").
		Context(ctx).
		Do()
	if err != nil {
		log.Printf("[ERROR] Bulk export write failed: %v", err)
		return err
	}

	log.Printf("[SHEETS BULK] Successfully exported %d students with rankings.", len(students))
	return nil
}
