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
	Path    string `json:"path" jsonschema:"Destination file path, relative to the working directory or absolute."`
	Content string `json:"content" jsonschema:"Complete content of the file, not a patch or appended fragment. An empty string creates or empties the file."`
}

const description = `Create a text file or replace its entire contents. Creates missing parent directories and writes content as supplied, without adding a newline.
Use this for new files or complete rewrites. It overwrites an existing file rather than appending; read existing contents first when they need to be preserved, and use edit for partial changes.`

// New creates the write tool using cwd as its working directory.
func New(cwd string) (tool.Tool, error) {
	return toolutil.New("write", description,
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
