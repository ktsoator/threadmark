package app

import (
	"context"

	"github.com/ktsoator/threadmark/internal/projects"
	"github.com/ktsoator/threadmark/internal/sessions"
)

// DeleteProject keeps reference checking and deletion atomic with project session creation.
func (a *App) DeleteProject(ctx context.Context, req *projects.DeleteRequest) error {
	a.projectSessionsMu.Lock()
	defer a.projectSessionsMu.Unlock()
	if _, err := a.Projects.Get(ctx, &projects.GetRequest{AppName: req.AppName, UserID: req.UserID, ProjectID: req.ProjectID}); err != nil {
		return err
	}
	items, err := a.Sessions.List(ctx, req.AppName, req.UserID)
	if err != nil {
		return err
	}
	for _, item := range items {
		if sessions.ProjectIDOf(item) == req.ProjectID {
			return projects.ErrNotEmpty
		}
	}
	return a.Projects.Delete(ctx, req)
}
