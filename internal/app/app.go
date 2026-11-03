package app

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/ktsoator/threadmark/internal/modelcatalog"
	"github.com/ktsoator/threadmark/internal/models/openaimodel"
	"github.com/ktsoator/threadmark/internal/skills"
	"github.com/ktsoator/threadmark/internal/tools"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/session/database"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/skilltoolset"
)

// App owns the dependencies shared by the agent and HTTP handlers.
type App struct {
	AgentLoader    agent.Loader
	SessionService session.Service
	SkillService   *skills.Service
}

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

	localTools, err := tools.New(cfg.WorkDir)
	if err != nil {
		return nil, fmt.Errorf("create tools: %w", err)
	}

	skillSource, skillsDirs, err := skills.NewSource(cfg.WorkDir)
	if err != nil {
		return nil, fmt.Errorf("discover skills: %w", err)
	}
	skillTools, err := skilltoolset.New(ctx, skilltoolset.Config{Source: skills.NewAgentSource(skillSource)})
	if err != nil {
		return nil, fmt.Errorf("create skill toolset: %w", err)
	}

	assistant, err := llmagent.New(llmagent.Config{
		Name:        "assistant",
		Model:       model,
		Description: "A general-purpose assistant that can read, edit, and write files and run Bash commands.",
		Instruction: fmt.Sprintf(`You are a friendly and accurate general-purpose assistant. Respond concisely in English by default, unless the user requests another language. Clearly state when you are uncertain.

Working directory: %s
Relative file paths and Bash commands use this directory. Absolute paths are also supported.
Use read to inspect text files before editing.
Use edit for targeted changes and write for new files or complete rewrites.
Use bash to list and search files and to run programs or tests. Each call starts a fresh shell.
Check tool errors and command exit codes, and use the results to decide what to do next.
Report changes and verification accurately. Do not claim an operation succeeded unless its tool result confirms it.`, cfg.WorkDir),
		Tools:                localTools,
		Toolsets:             []tool.Toolset{skillTools},
		OnToolErrorCallbacks: []llmagent.OnToolErrorCallback{tools.RecoverError},
	})
	if err != nil {
		return nil, fmt.Errorf("create agent: %w", err)
	}
	dbPath := filepath.Join(cfg.WorkDir, "threadmark.db")
	sessionService, err := database.NewSessionService(sqlite.Open(dbPath))
	if err != nil {
		return nil, fmt.Errorf("create session database: %w", err)
	}
	if err := database.AutoMigrate(sessionService); err != nil {
		return nil, fmt.Errorf("migrate session database: %w", err)
	}
	for _, dir := range skillsDirs {
		log.Printf("Skills directory: %s", dir)
	}
	log.Printf("Session database: %s", dbPath)
	log.Printf("Model: %s. Reasoning effort: %s.", modelInfo.ID, thinking.Effort)
	return &App{
		AgentLoader:    agent.NewSingleLoader(assistant),
		SessionService: sessionService,
		SkillService:   skills.NewService(skillSource),
	}, nil
}
