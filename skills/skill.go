package skills

import "errors"

var (
	ErrNotFound    = errors.New("skill not found")
	ErrInvalidName = errors.New("invalid skill name")
)

// Summary describes a skill without loading its instructions.
type Summary struct {
	Name        string
	Description string
}

// Detail includes the original Markdown body, without agent runtime hints.
type Detail struct {
	Name         string
	Description  string
	Instructions string
}
