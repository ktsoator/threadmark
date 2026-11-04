package app

import (
	"context"

	"github.com/ktsoator/threadmark/session"
	"github.com/ktsoator/threadmark/skills"
)

// SkillsFor resolves the conversation or project directory before loading skills.
func (a *App) SkillsFor(ctx context.Context, scope session.DirectoryContext) (*skills.Service, error) {
	path, err := a.Sessions.DirectoryFor(ctx, scope)
	if err != nil {
		return nil, err
	}
	source, _, err := skills.NewSource(path)
	if err != nil {
		return nil, err
	}
	return skills.NewService(source), nil
}
