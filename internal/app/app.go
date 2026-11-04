package app

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"sync"
	"time"

	"github.com/ktsoator/threadmark/internal/runtime"
	"github.com/ktsoator/threadmark/model/openaimodel"
	"github.com/ktsoator/threadmark/modelcatalog"
	"github.com/ktsoator/threadmark/project"
	"github.com/ktsoator/threadmark/session"
)

// App assembles services, owns their lifetime, and coordinates project deletion.
type App struct {
	Projects          project.Service
	Sessions          *session.Service
	Runtime           *runtime.Service
	closeStorage      func() error
	projectSessionsMu sync.Mutex
}

func (a *App) Close() error { return a.closeStorage() }

func New(ctx context.Context, cfg Config) (*App, error) {
	const providerID = "deepseek"
	modelInfo, err := modelcatalog.Lookup(providerID, cfg.ModelName)
	if err != nil {
		return nil, fmt.Errorf("find model: %w", err)
	}

	thinking := openaimodel.ThinkingOptions{Effort: "high"}
	clientConfig := &openaimodel.ClientConfig{
		API:        openaimodel.APIChatCompletions,
		APIKey:     cfg.APIKey,
		BaseURL:    "https://api.deepseek.com",
		HTTPClient: &http.Client{Timeout: 90 * time.Second},
	}

	clientConfig.Options, err = openaimodel.BuildThinkingOptions(providerID, modelInfo, clientConfig.API, thinking)
	if err != nil {
		return nil, fmt.Errorf("configure thinking: %w", err)
	}

	model, err := openaimodel.NewConfiguredModel(ctx, openaimodel.ModelConfig{
		Metadata: modelInfo,
	}, clientConfig)
	if err != nil {
		return nil, fmt.Errorf("create model: %w", err)
	}

	storage, err := openStorage(cfg)
	if err != nil {
		return nil, err
	}
	application := &App{Projects: storage.projects, closeStorage: storage.close}
	application.Sessions, err = session.NewService(session.Config{
		DB: storage.db, Store: storage.sessions, Projects: storage.projects,
		ManagedRoot: filepath.Join(storage.cfg.DataDir, "workspaces"), ProjectLock: &application.projectSessionsMu,
	})
	if err != nil {
		_ = storage.close()
		return nil, fmt.Errorf("create conversation service: %w", err)
	}
	application.Runtime = runtime.NewService(model, storage.sessions, application.Sessions)
	log.Printf("Session database: %s", storage.cfg.DBPath)
	log.Printf("Model: %s. Reasoning effort: %s.", modelInfo.ID, thinking.Effort)
	return application, nil
}
