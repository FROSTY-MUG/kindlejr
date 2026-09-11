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

// EnsureHeaders checks if the header row exists in Sheet1!A1:N1 and creates it if absent.
func EnsureHeaders(ctx context.Context) error {
	srv, spreadsheetID, err := getSheetsService(ctx)
	if err != nil {
		log.Printf("[SHEETS] %v", err)
		return nil // Non-fatal: mock mode
	}

	headers := []interface{}{
		"Entry Time", "Name", "Student ID", "College Email", "Course",
		"Enrollment Num", "Track", "Status", "Attempted", "Unattempted",
		"Time Taken", "Total Marks", "Submitted At", "Rank",
	}

	// Check if headers already exist
	resp, err := srv.Spreadsheets.Values.Get(spreadsheetID, "Sheet1!A1:N1").Context(ctx).Do()
	if err != nil || len(resp.Values) == 0 || len(resp.Values[0]) == 0 {
		log.Println("[SHEETS] Header row not found. Initializing Sheet1 headers...")
		valueRange := &sheets.ValueRange{Values: [][]interface{}{headers}}
		_, err = srv.Spreadsheets.Values.Update(spreadsheetID, "Sheet1!A1:N1", valueRange).
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

// UpsertStudentRow syncs student details upon login/registration or final submission,
// updating existing student rows or appending a new one, then auto-sorting by Total Marks (desc) and Time Taken (asc).
func UpsertStudentRow(ctx context.Context, st *models.StudentState) error {
	srv, spreadsheetID, err := getSheetsService(ctx)
	if err != nil {
		log.Printf("[MOCK SHEETS] Upsert student %s: %+v", st.StudentID, st)
		return nil
	}

	entryTimeStr := "-"
	if st.RegisteredAt != nil {
		entryTimeStr = st.RegisteredAt.Format("2006-01-02 15:04:05")
	} else if !st.UpdatedAt.IsZero() {
		entryTimeStr = st.UpdatedAt.Format("2006-01-02 15:04:05")
	}

	status := "Registered"
	if st.IsSubmitted {
		status = "Submitted"
	} else if st.SelectedTrack != "" {
		status = "In Progress"
	}

	timeTakenStr := "-"
	if st.IsSubmitted && st.TimeTakenFormatted != "" {
		timeTakenStr = st.TimeTakenFormatted
	}

	submittedAtStr := "-"
	if st.SubmittedAt != nil {
		submittedAtStr = st.SubmittedAt.Format("2006-01-02 15:04:05")
	}

	attempted := st.CorrectCount + st.IncorrectCount
	unattempted := st.UnattemptedCount
	if !st.IsSubmitted && unattempted == 0 {
		unattempted = 60
	}

	rowData := []interface{}{
		entryTimeStr,
		st.Name,
		st.StudentID,
		st.CollegeEmail,
		st.Course,
		st.EnrollmentNum,
		st.SelectedTrack,
		status,
		attempted,
		unattempted,
		timeTakenStr,
		st.TotalScore,
		submittedAtStr,
		"", // Rank (calculated by sort)
	}

	// 1. Fetch current Sheet data to find existing student ID row
	resp, err := srv.Spreadsheets.Values.Get(spreadsheetID, "Sheet1!C:C").Context(ctx).Do()
	targetRow := 0
	if err == nil && len(resp.Values) > 0 {
		for i, row := range resp.Values {
			if len(row) > 0 && fmt.Sprintf("%v", row[0]) == st.StudentID {
				targetRow = i + 1 // 1-based index
				break
			}
		}
	}

	if targetRow > 0 {
		// Update existing row
		rangeStr := fmt.Sprintf("Sheet1!A%d:N%d", targetRow, targetRow)
		valueRange := &sheets.ValueRange{Values: [][]interface{}{rowData}}
		_, err = srv.Spreadsheets.Values.Update(spreadsheetID, rangeStr, valueRange).
			ValueInputOption("USER_ENTERED").Context(ctx).Do()
		if err != nil {
			log.Printf("[ERROR] Failed to update row for student %s: %v", st.StudentID, err)
		} else {
			log.Printf("[SHEETS] Updated row %d for student %s", targetRow, st.StudentID)
		}
	} else {
		// Append new row
		valueRange := &sheets.ValueRange{Values: [][]interface{}{rowData}}
		_, err = srv.Spreadsheets.Values.Append(spreadsheetID, "Sheet1!A:N", valueRange).
			ValueInputOption("USER_ENTERED").InsertDataOption("INSERT_ROWS").Context(ctx).Do()
		if err != nil {
			log.Printf("[ERROR] Failed to append row for student %s: %v", st.StudentID, err)
		} else {
			log.Printf("[SHEETS] Appended new row for student %s", st.StudentID)
		}
	}

	// 2. Trigger auto-sort: Primary Total Marks (Col L / Index 11) DESC, Secondary Time Taken (Col K / Index 10) ASC
	sortReq := &sheets.BatchUpdateSpreadsheetRequest{
		Requests: []*sheets.Request{
			{
				SortRange: &sheets.SortRangeRequest{
					Range: &sheets.GridRange{
						SheetId:          0,
						StartRowIndex:    1, // Skip header row
						StartColumnIndex: 0,
						EndColumnIndex:   14,
					},
					SortSpecs: []*sheets.SortSpec{
						{DimensionIndex: 11, SortOrder: "DESCENDING"}, // Total Marks
						{DimensionIndex: 10, SortOrder: "ASCENDING"},  // Time Taken
					},
				},
			},
		},
	}

	_, _ = srv.Spreadsheets.BatchUpdate(spreadsheetID, sortReq).Context(ctx).Do()
	return nil
}

// BulkExportStudents clears existing data rows and writes all students sorted by score (desc) & time taken (asc)
// with computed rank. Used by the admin /api/admin/export-sheets endpoint.
func BulkExportStudents(ctx context.Context, students []models.StudentState) error {
	srv, spreadsheetID, err := getSheetsService(ctx)
	if err != nil {
		log.Printf("[SHEETS BULK] %v", err)
		return err
	}

	// Sort by TotalScore desc, tie-break by TimeTakenSeconds asc, then CorrectCount desc
	sort.Slice(students, func(i, j int) bool {
		if students[i].TotalScore != students[j].TotalScore {
			return students[i].TotalScore > students[j].TotalScore
		}
		if students[i].TimeTakenSeconds != students[j].TimeTakenSeconds && students[i].TimeTakenSeconds > 0 && students[j].TimeTakenSeconds > 0 {
			return students[i].TimeTakenSeconds < students[j].TimeTakenSeconds
		}
		return students[i].CorrectCount > students[j].CorrectCount
	})

	var rows [][]interface{}
	for i, s := range students {
		entryTimeStr := "-"
		if s.RegisteredAt != nil {
			entryTimeStr = s.RegisteredAt.Format("2006-01-02 15:04:05")
		} else if !s.UpdatedAt.IsZero() {
			entryTimeStr = s.UpdatedAt.Format("2006-01-02 15:04:05")
		}

		status := "Registered"
		if s.IsSubmitted {
			status = "Submitted"
		} else if s.SelectedTrack != "" {
			status = "In Progress"
		}

		timeTakenStr := "-"
		if s.IsSubmitted && s.TimeTakenFormatted != "" {
			timeTakenStr = s.TimeTakenFormatted
		}

		submittedAtStr := "-"
		if s.SubmittedAt != nil {
			submittedAtStr = s.SubmittedAt.Format("2006-01-02 15:04:05")
		}

		attempted := s.CorrectCount + s.IncorrectCount
		unattempted := s.UnattemptedCount
		if !s.IsSubmitted && unattempted == 0 {
			unattempted = 60
		}

		rows = append(rows, []interface{}{
			entryTimeStr,
			s.Name,
			s.StudentID,
			s.CollegeEmail,
			s.Course,
			s.EnrollmentNum,
			s.SelectedTrack,
			status,
			attempted,
			unattempted,
			timeTakenStr,
			s.TotalScore,
			submittedAtStr,
			i + 1, // Rank (1-based)
		})
	}

	// Clear existing data rows (preserve header row A1:N1)
	_, err = srv.Spreadsheets.Values.Clear(spreadsheetID, "Sheet1!A2:N", &sheets.ClearValuesRequest{}).
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
