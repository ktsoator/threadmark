package app

import (
	"context"

	"github.com/ktsoator/threadmark/project"
	"github.com/ktsoator/threadmark/session"
)

// DeleteProject keeps reference checking and deletion atomic with project session creation.
func (a *App) DeleteProject(ctx context.Context, req *project.DeleteRequest) error {
	a.projectSessionsMu.Lock()
	defer a.projectSessionsMu.Unlock()
	if _, err := a.Projects.Get(ctx, &project.GetRequest{AppName: req.AppName, UserID: req.UserID, ProjectID: req.ProjectID}); err != nil {
		return err
	}
	items, err := a.Sessions.List(ctx, &session.ListRequest{AppName: req.AppName, UserID: req.UserID})
	if err != nil {
		return err
	}
	for _, item := range items.Sessions {
		if session.ProjectIDOf(item) == req.ProjectID {
			return project.ErrNotEmpty
		}
	}
	return a.Projects.Delete(ctx, req)
}
