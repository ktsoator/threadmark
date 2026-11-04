package database

import (
	"context"

	"github.com/ktsoator/threadmark/project"
	"github.com/ktsoator/threadmark/session"
)

// DirectoryFor resolves the same directory for agent tools and the Skills page. History and
// metadata operations do not depend on the directory being available.
func (s *service) DirectoryFor(ctx context.Context, scope session.DirectoryContext) (string, error) {
	if scope.SessionID != "" && scope.ProjectID != "" {
		return "", session.ErrConflictingContext
	}
	if scope.SessionID == "" && scope.ProjectID == "" {
		return "", nil
	}
	if scope.AppName == "" || scope.UserID == "" {
		return "", session.ErrMissingContext
	}
	var path string
	if scope.SessionID != "" {
		stored, err := s.get(ctx, session.Ref{AppName: scope.AppName, UserID: scope.UserID, SessionID: scope.SessionID})
		if err != nil {
			return "", err
		}
		scope.ProjectID = session.ProjectIDOf(stored)
		path = s.ManagedDirectory(stored)
	}
	if scope.ProjectID != "" {
		result, err := s.projects.Get(ctx, &project.GetRequest{AppName: scope.AppName, UserID: scope.UserID, ProjectID: scope.ProjectID})
		if err != nil {
			return "", err
		}
		path = result.Project.Directory
	}
	if path == "" {
		return "", session.ErrMissingDirectory
	}
	real, err := project.NormalizeDirectory(path)
	if err != nil {
		return "", session.ErrDirectoryUnavailable
	}
	if real != path {
		return "", session.ErrDirectoryChanged
	}
	return path, nil
}
