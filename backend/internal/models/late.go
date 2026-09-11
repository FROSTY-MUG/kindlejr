package models

import "time"

// LateSubmission records a quiz submission that was received after the
// sanctioned exam deadline. It is tracked separately from the regular
// student document so that late entries stay visible to the master admin
// dashboard without polluting the primary leaderboard collection.
type LateSubmission struct {
	StudentID        string    `firestore:"studentId" json:"studentId"`
	Name             string    `firestore:"name" json:"name"`
	CollegeEmail     string    `firestore:"collegeEmail" json:"collegeEmail"`
	Course           string    `firestore:"course" json:"course"`
	EnrollmentNum    string    `firestore:"enrollmentNum" json:"enrollmentNum"`
	SelectedTrack    string    `firestore:"selectedTrack" json:"selectedTrack"`
	TotalScore       int       `firestore:"totalScore" json:"totalScore"`
	CorrectCount     int       `firestore:"correctCount" json:"correctCount"`
	IncorrectCount   int       `firestore:"incorrectCount" json:"incorrectCount"`
	UnattemptedCount int       `firestore:"unattemptedCount" json:"unattemptedCount"`
	Deadline         time.Time `firestore:"deadline" json:"deadline"`
	RecordedAt       time.Time `firestore:"recordedAt" json:"recordedAt"`
}
