package main

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/openai/openai-go/v3/option"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/cmd/launcher"
	"google.golang.org/adk/v2/cmd/launcher/console"
	"google.golang.org/adk/v2/model/openaimodel"
	"google.golang.org/adk/v2/session"
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

	model, err := openaimodel.NewModel(ctx, modelName, &openaimodel.ClientConfig{
		APIKey:  apiKey,
		BaseURL: "https://api.deepseek.com",
		API:     openaimodel.APIChatCompletions,
		Options: []option.RequestOption{
			option.WithJSONSet("thinking", map[string]string{"type": "disabled"}),
		},
	})
	if err != nil {
		log.Fatalf("Failed to create model: %v", err)
	}

	assistant, err := llmagent.New(llmagent.Config{
		Name:        "assistant",
		Model:       model,
		Description: "A simple general-purpose conversational assistant.",
		Instruction: "You are a friendly and accurate general-purpose assistant. Respond concisely in English by default, unless the user requests another language. Clearly state when you are uncertain.",
	})
	if err != nil {
		log.Fatalf("Failed to create agent: %v", err)
	}

	log.Printf("Model: %s. Type a question and press Enter. Press Ctrl+C to exit.", modelName)
	if err := console.NewLauncher().Run(ctx, &launcher.Config{
		AgentLoader:    agent.NewSingleLoader(assistant),
		SessionService: session.InMemoryService(),
	}); err != nil {
		log.Fatalf("Failed to run agent: %v", err)
	}
}
