package tools

import (
	"path/filepath"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

type result struct {
	Output   string `json:"output"`
	Error    string `json:"error,omitempty"`
	ExitCode *int   `json:"exitCode,omitempty"`
}

// New creates the four tools using cwd as their working directory.
func New(cwd string) ([]tool.Tool, error) {
	var registered []tool.Tool
	for _, create := range []func(string) (tool.Tool, error){newRead, newBash, newEdit, newWrite} {
		t, err := create(cwd)
		if err != nil {
			return nil, err
		}
		registered = append(registered, t)
	}
	return registered, nil
}

func newTool[T any](name, description string, run func(agent.Context, T) (result, error)) (tool.Tool, error) {
	return functiontool.New(functiontool.Config{Name: name, Description: description},
		func(ctx agent.Context, args T) (result, error) {
			if err := ctx.Err(); err != nil {
				return result{}, err
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

// RecoverError returns ADK argument validation errors to the model too.
func RecoverError(ctx agent.Context, _ tool.Tool, _ map[string]any, err error) (map[string]any, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	return map[string]any{"error": err.Error()}, nil
}

func resolvePath(cwd, path string) string {
	if filepath.IsAbs(path) {
		return path
	}
	return filepath.Join(cwd, path)
}
