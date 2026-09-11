// Package config provides zero-dependency environment loading for the backend.
//
// The service reads its configuration entirely from environment variables so it
// can run unchanged on Railway, Cloud Run, Docker or a developer laptop. The
// optional .env loader below exists purely for local development: it never
// overwrites a variable that the surrounding process already exported.
package config

import (
	"bufio"
	"log"
	"os"
	"strings"
)

// LoadDotEnv reads the first .env file that exists from the supplied candidate
// paths and merges its key/value pairs into the process environment.
//
// Rules:
//   - Lines starting with '#' and blank lines are ignored.
//   - A leading "export " prefix is tolerated.
//   - Values may be wrapped in single or double quotes (quotes are stripped).
//   - An already-set environment variable always wins, so platform-provided
//     configuration (Railway, Cloud Run) is never clobbered by a stale file.
func LoadDotEnv(candidates ...string) {
	for _, path := range candidates {
		if path == "" {
			continue
		}
		if _, err := os.Stat(path); err != nil {
			continue
		}
		if err := loadFile(path); err != nil {
			log.Printf("[CONFIG] Failed to read %s: %v", path, err)
			continue
		}
		log.Printf("[CONFIG] Loaded environment defaults from %s", path)
		return
	}
}

func loadFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	// Allow long values (e.g. Base64 service-account JSON) up to 1 MiB.
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') ||
				(value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
	return scanner.Err()
}
