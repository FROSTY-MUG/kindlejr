package db

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"time"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
	"kindle-jr/internal/models"
)

// Store wraps the Firestore client for all student state persistence.
type Store struct {
	Client *firestore.Client
}

const collectionName = "kindle_students"

// InitFirestore initializes the Firebase Admin SDK and returns a Firestore-backed Store.
// Credential resolution order:
//  1. GOOGLE_SHEETS_CREDENTIALS_BASE64 (Base64 service-account JSON, decoded in-memory)
//  2. GOOGLE_APPLICATION_CREDENTIALS (local file path, for development)
//  3. Application Default Credentials (GCE / Cloud Run metadata)
func InitFirestore() (*Store, error) {
	ctx := context.Background()
	projectID := os.Getenv("FIREBASE_PROJECT_ID")
	if projectID == "" {
		projectID = "kindle-jr-5-prod"
	}

	conf := &firebase.Config{ProjectID: projectID}
	var opt option.ClientOption

	// 1. Attempt Base64 decode first (production / Railway / Docker)
	base64Creds := os.Getenv("GOOGLE_SHEETS_CREDENTIALS_BASE64")
	if base64Creds != "" {
		creds, err := base64.StdEncoding.DecodeString(base64Creds)
		if err != nil {
			return nil, fmt.Errorf("failed to decode GOOGLE_SHEETS_CREDENTIALS_BASE64: %v", err)
		}
		opt = option.WithCredentialsJSON(creds)
		log.Println("[INIT] Using Base64-decoded service account credentials for Firebase.")
	} else {
		// 2. Fallback to local file path (development)
		credPath := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")
		if credPath != "" {
			opt = option.WithCredentialsFile(credPath)
			log.Printf("[INIT] Using credentials file at %s for Firebase.", credPath)
		} else {
			log.Println("[INIT] No explicit credentials found. Using Application Default Credentials.")
		}
	}

	var app *firebase.App
	var err error
	if opt != nil {
		app, err = firebase.NewApp(ctx, conf, opt)
	} else {
		app, err = firebase.NewApp(ctx, conf)
	}

	if err != nil {
		return nil, fmt.Errorf("error initializing Firebase app: %v", err)
	}

	client, err := app.Firestore(ctx)
	if err != nil {
		return nil, fmt.Errorf("error initializing Firestore client: %v", err)
	}

	log.Println("[INFO] Successfully connected to Cloud Firestore via Firebase Admin SDK.")
	return &Store{Client: client}, nil
}

// Close shuts down the Firestore client connection.
func (s *Store) Close() error {
	if s.Client != nil {
		return s.Client.Close()
	}
	return nil
}

// GetStudent retrieves a single student's state document from Firestore.
func (s *Store) GetStudent(ctx context.Context, studentID string) (*models.StudentState, error) {
	doc, err := s.Client.Collection(collectionName).Doc(studentID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("student %s not found: %v", studentID, err)
	}

	var state models.StudentState
	if err := doc.DataTo(&state); err != nil {
		return nil, fmt.Errorf("failed to parse student data for %s: %v", studentID, err)
	}
	return &state, nil
}

// UpsertStudentMap performs a merge-upsert of arbitrary field updates into the student document.
// Uses Firestore MergeAll to only touch the specified fields.
func (s *Store) UpsertStudentMap(ctx context.Context, studentID string, updates map[string]interface{}) error {
	updates["updatedAt"] = time.Now().UTC()
	_, err := s.Client.Collection(collectionName).Doc(studentID).Set(ctx, updates, firestore.MergeAll)
	if err != nil {
		log.Printf("[ERROR] Firestore upsert failed for student %s: %v", studentID, err)
		return err
	}
	return nil
}

// GetAllStudents retrieves every document in the kindle_students collection.
// Used by the admin leaderboard and bulk export endpoints.
func (s *Store) GetAllStudents(ctx context.Context) ([]models.StudentState, error) {
	var students []models.StudentState
	iter := s.Client.Collection(collectionName).Documents(ctx)
	defer iter.Stop()

	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("error iterating students: %v", err)
		}
		var student models.StudentState
		if err := doc.DataTo(&student); err != nil {
			log.Printf("[WARN] Skipping malformed student document %s: %v", doc.Ref.ID, err)
			continue
		}
		students = append(students, student)
	}
	return students, nil
}
