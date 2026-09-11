package models

import "time"

// StudentState holds full details and quiz progress for a student.
type StudentState struct {
	StudentID          string            `firestore:"studentId" json:"studentId"`
	Name               string            `firestore:"name" json:"name"`
	PersonalEmail      string            `firestore:"personalEmail" json:"personalEmail"`
	CollegeEmail       string            `firestore:"collegeEmail" json:"collegeEmail"`
	Course             string            `firestore:"course" json:"course"`
	EnrollmentNum      string            `firestore:"enrollmentNum" json:"enrollmentNum"`
	SelectedTrack      string            `firestore:"selectedTrack" json:"selectedTrack"` // "C" or "Python"
	RegisteredAt       *time.Time        `firestore:"registeredAt,omitempty" json:"registeredAt,omitempty"`
	StartedAt          *time.Time        `firestore:"startedAt,omitempty" json:"startedAt,omitempty"`
	CurrentQuestion    int               `firestore:"currentQuestion" json:"currentQuestion"`
	ShuffledOrder      []int             `firestore:"shuffledOrder" json:"shuffledOrder"`
	Answers            map[string]string `firestore:"answers" json:"answers"` // QuestionID -> Answer
	IsSubmitted        bool              `firestore:"isSubmitted" json:"isSubmitted"`
	TotalScore         int               `firestore:"totalScore" json:"totalScore"` // Total Marks
	CorrectCount       int               `firestore:"correctCount" json:"correctCount"`
	IncorrectCount     int               `firestore:"incorrectCount" json:"incorrectCount"`
	UnattemptedCount   int               `firestore:"unattemptedCount" json:"unattemptedCount"`
	TimeTakenSeconds   int               `firestore:"timeTakenSeconds" json:"timeTakenSeconds"`
	TimeTakenFormatted string            `firestore:"timeTakenFormatted" json:"timeTakenFormatted"`
	SubmittedAt        *time.Time        `firestore:"submittedAt,omitempty" json:"submittedAt,omitempty"`
	Cheated            bool              `firestore:"cheated" json:"cheated"`
	UpdatedAt          time.Time         `firestore:"updatedAt" json:"updatedAt"`
}
