package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/ktsoator/threadmark/internal/modelcatalog"
	"github.com/ktsoator/threadmark/internal/models/openaimodel"
	"github.com/ktsoator/threadmark/internal/skills"
	"github.com/ktsoator/threadmark/internal/tools"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/cmd/launcher"
	"google.golang.org/adk/v2/cmd/launcher/full"
	"google.golang.org/adk/v2/session/database"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/skilltoolset"
)

func main() {
	log.SetFlags(0)
	ctx := context.Background()

	apiKey := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY"))
	if apiKey == "" || apiKey == "your-api-key-here" {
		log.Fatal("Set DEEPSEEK_API_KEY in .env and run 'source .env' to load the configuration.")
	}
	modelName := strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL"))
	if modelName == "" {
		modelName = "deepseek-flash"
	}
	const providerID = "deepseek"
	modelInfo, err := modelcatalog.Lookup(providerID, modelName)
	if err != nil {
		log.Fatalf("Failed to find model: %v", err)
	}
	thinking := openaimodel.ThinkingOptions{Effort: "high"}
	clientConfig := &openaimodel.ClientConfig{
		API:        openaimodel.APIChatCompletions,
		APIKey:     apiKey,
		BaseURL:    "https://api.deepseek.com",
		HTTPClient: &http.Client{Timeout: 90 * time.Second},
	}
	clientConfig.Options, err = openaimodel.BuildThinkingOptions(providerID, modelInfo, clientConfig.API, thinking)
	if err != nil {
		log.Fatalf("Failed to configure thinking: %v", err)
	}
	model, err := openaimodel.NewConfiguredModel(ctx, openaimodel.ModelConfig{
		Metadata: modelInfo,
	}, clientConfig)
	if err != nil {
		log.Fatalf("Failed to create model: %v", err)
	}

	cwd, err := os.Getwd()
	if err != nil {
		log.Fatalf("Failed to get working directory: %v", err)
	}
	localTools, err := tools.New(cwd)
	if err != nil {
		log.Fatalf("Failed to create tools: %v", err)
	}

	skillSource, skillsDirs, err := skills.NewSource(cwd)
	if err != nil {
		log.Fatalf("Failed to discover skill directories: %v", err)
	}
	skillTools, err := skilltoolset.New(ctx, skilltoolset.Config{Source: skillSource})
	if err != nil {
		log.Fatalf("Failed to create skill toolset: %v", err)
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
Report changes and verification accurately. Do not claim an operation succeeded unless its tool result confirms it.`, cwd),
		Tools:                localTools,
		Toolsets:             []tool.Toolset{skillTools},
		OnToolErrorCallbacks: []llmagent.OnToolErrorCallback{tools.RecoverError},
	})
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
	}

	dbPath := filepath.Join(cwd, "threadmark.db")
	sessionService, err := database.NewSessionService(sqlite.Open(dbPath))
	if err != nil {
		log.Fatalf("Failed to create session database: %v", err)
	}
	if err := database.AutoMigrate(sessionService); err != nil {
		log.Fatalf("Failed to migrate session database: %v", err)
	}

	for _, dir := range skillsDirs {
		log.Printf("Skills directory: %s", dir)
	}
	log.Printf("Session database: %s", dbPath)
	log.Printf("Model: %s. Reasoning effort: %s. Press Ctrl+C to exit.", modelInfo.ID, thinking.Effort)
	if err := full.NewLauncher().Execute(ctx, &launcher.Config{
		AgentLoader:    agent.NewSingleLoader(assistant),
		SessionService: sessionService,
	}, os.Args[1:]); err != nil {
		log.Fatalf("Failed to run agent: %v", err)
	}
}
