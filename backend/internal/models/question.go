package models

type Question struct {
	ID          string   `json:"id"`
	Type        string   `json:"type"`    // "mcq" or "blank"
	Section     string   `json:"section"` // "C Language" or "Python"
	Text        string   `json:"text"`
	Options     []string `json:"options,omitempty"`
	Answer      string   `json:"answer,omitempty"` // Included in backend, omitted when serving client if desired
	Explanation string   `json:"explanation,omitempty"`
}
