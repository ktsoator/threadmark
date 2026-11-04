package skills

import (
	"context"

	"github.com/ktsoator/threadmark/internal/sessions"
)

// DirectoryResolver supplies the same working directory used by agent tools.
type DirectoryResolver interface {
	DirectoryFor(context.Context, sessions.DirectoryContext) (string, error)
}

func NewScopedService(ctx context.Context, directories DirectoryResolver, scope sessions.DirectoryContext) (*Service, error) {
	path, err := directories.DirectoryFor(ctx, scope)
	if err != nil {
		return nil, err
	}
	source, _, err := NewSource(path)
	if err != nil {
		return nil, err
	}
	return NewService(source), nil
}
