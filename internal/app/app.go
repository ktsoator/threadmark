package app

import (
	"context"
	"fmt"
	"log"
	"path/filepath"
	"sync"

	"github.com/ktsoator/threadmark/internal/runtime"
	"github.com/ktsoator/threadmark/project"
	"github.com/ktsoator/threadmark/session"
)

// App assembles services, owns their lifetime, and coordinates project deletion.
type App struct {
	Projects          project.Service
	Sessions          *session.Service
	Runtime           *runtime.Service
	Models            *runtime.ModelList
	closeStorage      func() error
	projectSessionsMu sync.Mutex
}

func (a *App) Close() error { return a.closeStorage() }

func New(ctx context.Context, cfg Config) (*App, error) {
	models, newModel, err := prepareModels(cfg)
	if err != nil {
		return nil, fmt.Errorf("configure models: %w", err)
	}

	storage, err := openStorage(cfg)
	if err != nil {
		return nil, err
	}
	application := &App{Projects: storage.projects, Models: models, closeStorage: storage.close}
	application.Sessions, err = session.NewService(session.Config{
		DB: storage.db, Store: storage.sessions, Projects: storage.projects,
		ManagedRoot: filepath.Join(storage.cfg.DataDir, "workspaces"), ProjectLock: &application.projectSessionsMu,
	})
	if err != nil {
		_ = storage.close()
		return nil, fmt.Errorf("create conversation service: %w", err)
	}
	application.Runtime = runtime.NewService(newModel, storage.sessions, application.Sessions)
	log.Printf("Session database: %s", storage.cfg.DBPath)
	log.Printf("Default model: %s/%s", cfg.DefaultModel.ProviderID, cfg.DefaultModel.ModelID)
	return application, nil
}
