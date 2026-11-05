// Package tools assembles the standalone tools used by the local agent.
package tools

import (
	"github.com/ktsoator/threadmark/tools/bash"
	"github.com/ktsoator/threadmark/tools/edit"
	"github.com/ktsoator/threadmark/tools/read"
	"github.com/ktsoator/threadmark/tools/write"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
)

// New creates the four tools using cwd as their working directory.
func New(cwd string) ([]tool.Tool, error) {
	var registered []tool.Tool
	for _, create := range []func(string) (tool.Tool, error){read.New, bash.New, edit.New, write.New} {
		t, err := create(cwd)
		if err != nil {
			return nil, err
		}
		registered = append(registered, t)
	}
	return registered, nil
}

// RecoverError returns ADK argument validation errors to the model too.
func RecoverError(ctx agent.Context, _ tool.Tool, _ map[string]any, err error) (map[string]any, error) {
	if ctx.Err() != nil {
		return nil, ctx.Err()
	}
	return map[string]any{"error": err.Error()}, nil
}
