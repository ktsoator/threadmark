package sessions

import (
	"context"

	"github.com/ktsoator/threadmark/internal/projects"
)

type DirectoryContext struct {
	AppName   string
	UserID    string
	SessionID string
	ProjectID string
}

// DirectoryFor resolves the same directory for agent tools and the Skills page. History and
// metadata operations do not depend on the directory being available.
func (s *Service) DirectoryFor(ctx context.Context, scope DirectoryContext) (string, error) {
	if scope.SessionID != "" && scope.ProjectID != "" {
		return "", ErrConflictingContext
	}
	if scope.SessionID == "" && scope.ProjectID == "" {
		return "", nil
	}
	if scope.AppName == "" || scope.UserID == "" {
		return "", ErrMissingContext
	}
	var path string
	if scope.SessionID != "" {
		stored, err := s.Get(ctx, Ref{AppName: scope.AppName, UserID: scope.UserID, SessionID: scope.SessionID})
		if err != nil {
			return "", err
		}
		scope.ProjectID = ProjectIDOf(stored)
		path = s.ManagedDirectory(stored)
	}
	if scope.ProjectID != "" {
		result, err := s.projects.Get(ctx, &projects.GetRequest{AppName: scope.AppName, UserID: scope.UserID, ProjectID: scope.ProjectID})
		if err != nil {
			return "", err
		}
		path = result.Project.Directory
	}
	if path == "" {
		return "", ErrMissingDirectory
	}
	real, err := projects.NormalizeDirectory(path)
	if err != nil {
		return "", ErrDirectoryUnavailable
	}
	if real != path {
		return "", ErrDirectoryChanged
	}
	return path, nil
}
