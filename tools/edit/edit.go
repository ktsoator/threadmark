package edit

import (
	"fmt"
	"os"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/ktsoator/threadmark/tools/internal/toolutil"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
)

type editArgs struct {
	Path  string        `json:"path" jsonschema:"Path to the existing text file, relative or absolute."`
	Edits []replacement `json:"edits" jsonschema:"One or more replacements matched against the original file. Regions must be unique and non-overlapping. Merge changes to the same block into one replacement."`
}

type replacement struct {
	OldText string `json:"oldText" jsonschema:"Non-empty exact text to replace. Must occur exactly once in the original file. Line endings are normalized for matching; other whitespace must match."`
	NewText string `json:"newText" jsonschema:"Replacement text. An empty string deletes the matched text."`
}

// New creates the edit tool using cwd as its working directory.
func New(cwd string) (tool.Tool, error) {
	return toolutil.New("edit", "Make targeted changes to an existing UTF-8 file. Read the file first and batch changes to that file in edits. All oldText values must match unique, non-overlapping regions of the original file; all replacements are validated before writing. Preserves the BOM and original line-ending style. Returns a unified diff and the first changed line (1-based). Use write for new files or complete rewrites.",
		func(ctx agent.Context, args editArgs) (toolutil.Result, error) {
			if len(args.Edits) == 0 {
				return toolutil.Result{}, fmt.Errorf("edits must contain at least one replacement")
			}
			path := toolutil.ResolvePath(cwd, args.Path)
			content, err := readText(path)
			if err != nil {
				return toolutil.Result{}, err
			}
			bom := ""
			if strings.HasPrefix(content, "\uFEFF") {
				bom, content = "\uFEFF", strings.TrimPrefix(content, "\uFEFF")
			}
			ending := lineEnding(content)
			original := normalizeNewlines(content)
			updated, err := applyEdits(original, args.Edits)
			if err != nil {
				return toolutil.Result{}, err
			}
			if err := ctx.Err(); err != nil {
				return toolutil.Result{}, err
			}
			diff, firstChangedLine, err := makeDiff(args.Path, original, updated)
			if err != nil {
				return toolutil.Result{}, fmt.Errorf("generate edit diff: %w", err)
			}
			if err := ctx.Err(); err != nil {
				return toolutil.Result{}, err
			}
			if err := os.WriteFile(path, []byte(bom+strings.ReplaceAll(updated, "\n", ending)), 0644); err != nil {
				return toolutil.Result{}, err
			}
			return toolutil.Result{
				Output:           fmt.Sprintf("Replaced %d block(s) in %s.", len(args.Edits), path),
				Diff:             diff,
				FirstChangedLine: firstChangedLine,
			}, nil
		})
}

// applyEdits validates every match against the same original content before applying any.
func applyEdits(content string, edits []replacement) (string, error) {
	type match struct {
		index, start, end int
		text              string
	}
	matches := make([]match, 0, len(edits))
	for i, edit := range edits {
		oldText := normalizeNewlines(edit.OldText)
		if oldText == "" {
			return "", fmt.Errorf("edits[%d].oldText must not be empty", i)
		}
		start := strings.Index(content, oldText)
		if start < 0 {
			return "", fmt.Errorf("edits[%d].oldText was not found; read the file again", i)
		}
		if start != strings.LastIndex(content, oldText) {
			return "", fmt.Errorf("edits[%d].oldText matches multiple locations; include more surrounding text", i)
		}
		matches = append(matches, match{
			index: i, start: start, end: start + len(oldText), text: normalizeNewlines(edit.NewText),
		})
	}
	sort.Slice(matches, func(i, j int) bool { return matches[i].start < matches[j].start })
	for i := 1; i < len(matches); i++ {
		if matches[i-1].end > matches[i].start {
			return "", fmt.Errorf("edits[%d] and edits[%d] overlap; merge them into one replacement", matches[i-1].index, matches[i].index)
		}
	}
	var updated strings.Builder
	end := 0
	for _, match := range matches {
		updated.WriteString(content[end:match.start])
		updated.WriteString(match.text)
		end = match.end
	}
	updated.WriteString(content[end:])
	if updated.String() == content {
		return "", fmt.Errorf("no changes made; replacements produce identical content")
	}
	return updated.String(), nil
}

func normalizeNewlines(text string) string {
	return strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n")
}

func lineEnding(text string) string {
	if i := strings.IndexAny(text, "\r\n"); i >= 0 && text[i] == '\r' {
		if i+1 < len(text) && text[i+1] == '\n' {
			return "\r\n"
		}
		return "\r"
	}
	return "\n"
}

func readText(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("path is not a regular file: %s", path)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if !utf8.Valid(data) {
		return "", fmt.Errorf("file is not UTF-8 text: %s", path)
	}
	return string(data), nil
}
