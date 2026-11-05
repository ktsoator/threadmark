package toolutil

import (
	"path/filepath"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

const (
	MaxOutputLines = 2000
	MaxOutputBytes = 50 * 1024
)

// Result is the common model-facing response from a local tool.
type Result struct {
	Output           string `json:"output"`
	Error            string `json:"error,omitempty"`
	ExitCode         *int   `json:"exitCode,omitempty"`
	Truncated        bool   `json:"truncated,omitempty"`
	NextOffset       int    `json:"nextOffset,omitempty"`
	FullOutputPath   string `json:"fullOutputPath,omitempty"`
	Diff             string `json:"diff,omitempty"`
	FirstChangedLine int    `json:"firstChangedLine,omitempty"`
}

// New wraps a handler with cancellation checks and model-readable errors.
func New[T any](name, description string, run func(agent.Context, T) (Result, error)) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{Name: name, Description: description},
		func(ctx agent.Context, args T) (Result, error) {
			if err := ctx.Err(); err != nil {
				return Result{}, err
			}
			out, err := run(ctx, args)
			if ctx.Err() != nil {
				return out, ctx.Err()
			}
			// Return tool failures to the model so it can adjust its next call.
			if err != nil {
				out.Error = err.Error()
			}
			return out, nil
		})
}

// ResolvePath resolves relative paths against the tool working directory.
func ResolvePath(cwd, path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(cwd, path)
}
