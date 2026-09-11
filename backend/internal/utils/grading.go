package utils

import (
	"regexp"
	"strings"
)

var punctRegex = regexp.MustCompile(`[^\w\s]`)

// NormalizeAnswer strips punctuation, lowercases, and maps word numbers to digits.
func NormalizeAnswer(ans string) string {
	// 1. Lowercase and trim structural whitespace
	ans = strings.ToLower(strings.TrimSpace(ans))

	// 2. Strip standard punctuation
	ans = punctRegex.ReplaceAllString(ans, "")
	ans = strings.TrimSpace(ans)

	// 3. Map word numbers commonly typed in fill-in-the-blanks
	numMap := map[string]string{
		"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4",
		"five": "5", "six": "6", "seven": "7", "eight": "8", "nine": "9",
		"ten": "10",
	}

	if val, exists := numMap[ans]; exists {
		return val
	}

	return ans
}
