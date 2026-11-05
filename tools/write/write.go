package write

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/ktsoator/threadmark/tools/internal/toolutil"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
)

type writeArgs struct {
	Path    string `json:"path" jsonschema:"File path, relative or absolute."`
	Content string `json:"content" jsonschema:"Complete content to write, replacing any existing content."`
}

// New creates the write tool using cwd as its working directory.
func New(cwd string) (tool.Tool, error) {
	return toolutil.New("write", "Create or overwrite a text file. Creates missing parent directories.",
		func(ctx agent.Context, args writeArgs) (toolutil.Result, error) {
			path := toolutil.ResolvePath(cwd, args.Path)
			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				return toolutil.Result{}, err
			}
			if err := ctx.Err(); err != nil {
				return toolutil.Result{}, err
			}
			if err := os.WriteFile(path, []byte(args.Content), 0644); err != nil {
				return toolutil.Result{}, err
			}
			return toolutil.Result{Output: fmt.Sprintf("Wrote %d bytes to %s.", len(args.Content), path)}, nil
		})
}
