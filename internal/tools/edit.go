package tools

import (
	"fmt"
	"os"
	"strings"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
)

type editArgs struct {
	Path    string `json:"path" jsonschema:"Path to the existing text file, relative or absolute."`
	OldText string `json:"oldText" jsonschema:"Non-empty exact text to replace. Must occur exactly once."`
	NewText string `json:"newText" jsonschema:"Replacement text. An empty string deletes the matched text."`
}

func newEdit(cwd string) (tool.Tool, error) {
	return newTool("edit", "Replace one unique occurrence of oldText with newText. Read the file first; matching includes whitespace.",
		func(ctx agent.Context, args editArgs) (result, error) {
			if args.OldText == "" {
				return result{}, fmt.Errorf("oldText must not be empty")
			}
			path := resolvePath(cwd, args.Path)
			content, err := readText(path)
			if err != nil {
				return result{}, err
			}
			index := strings.Index(content, args.OldText)
			if index < 0 {
				return result{}, fmt.Errorf("oldText was not found; read the file again")
			}
			if index != strings.LastIndex(content, args.OldText) {
				return result{}, fmt.Errorf("oldText matches multiple locations; include more surrounding text")
			}
			if err := ctx.Err(); err != nil {
				return result{}, err
			}
			updated := strings.Replace(content, args.OldText, args.NewText, 1)
			if err := os.WriteFile(path, []byte(updated), 0644); err != nil {
				return result{}, err
			}
			return result{Output: "Updated " + path}, nil
		})
}
