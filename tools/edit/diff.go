package edit

import (
	"path/filepath"
	"strings"

	"github.com/pmezard/go-difflib/difflib"
)

// makeDiff compares LF-normalized text without the BOM, as displayed to the model.
func makeDiff(path, before, after string) (string, int, error) {
	diff, err := difflib.GetUnifiedDiffString(difflib.UnifiedDiff{
		A:        diffLines(before),
		B:        diffLines(after),
		FromFile: filepath.ToSlash(path),
		ToFile:   filepath.ToSlash(path),
		Context:  3,
	})
	firstChangedLine := 1
	for i := 0; i < len(before) && i < len(after) && before[i] == after[i]; i++ {
		if before[i] == '\n' {
			firstChangedLine++
		}
	}
	return diff, firstChangedLine, err
}

func diffLines(text string) []string {
	if text == "" {
		return nil
	}
	lines := strings.SplitAfter(text, "\n")
	last := len(lines) - 1
	if lines[last] == "" {
		return lines[:last]
	}
	// Keep the marker in the final slice entry so it does not count as a file line.
	lines[last] += "\n\\ No newline at end of file\n"
	return lines
}
