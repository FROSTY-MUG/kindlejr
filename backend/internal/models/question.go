package models

type Question struct {
	ID          string   `json:"id"`
	Type        string   `json:"type"` // "mcq" or "blank"
	Section     string   `json:"section"` // "Aptitude", "C Coding", "Python Coding"
	Text        string   `json:"text"`
	Options     []string `json:"options,omitempty"`
	Answer      string   `json:"answer,omitempty"` // Included in backend, omitted when serving client if desired
	Explanation string   `json:"explanation,omitempty"`
}
