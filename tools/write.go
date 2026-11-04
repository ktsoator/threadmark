package tools

import (
	"fmt"
	"os"
	"path/filepath"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
)

type writeArgs struct {
	Path    string `json:"path" jsonschema:"File path, relative or absolute."`
	Content string `json:"content" jsonschema:"Complete content to write, replacing any existing content."`
}

func newWrite(cwd string) (tool.Tool, error) {
	return newTool("write", "Create or overwrite a text file. Creates missing parent directories.",
		func(ctx agent.Context, args writeArgs) (result, error) {
			path := resolvePath(cwd, args.Path)
			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				return result{}, err
			}
			if err := ctx.Err(); err != nil {
				return result{}, err
			}
			if err := os.WriteFile(path, []byte(args.Content), 0644); err != nil {
				return result{}, err
			}
			return result{Output: fmt.Sprintf("Wrote %d bytes to %s.", len(args.Content), path)}, nil
		})
}
