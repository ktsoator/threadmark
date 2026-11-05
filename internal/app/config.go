package app

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	agentruntime "github.com/ktsoator/threadmark/internal/runtime"
	"github.com/ktsoator/threadmark/model/openaimodel"
	"github.com/ktsoator/threadmark/modelcatalog"
)

// Config holds the settings used to assemble the local application.
type Config struct {
	Addr         string
	DataDir      string
	DBPath       string
	Providers    map[string]ProviderConfig
	DefaultModel agentruntime.ModelSelection
}

func LoadConfig() (Config, error) {
	cfg := Config{
		Addr:    strings.TrimSpace(os.Getenv("THREADMARK_ADDR")),
		DataDir: os.Getenv("THREADMARK_DATA_DIR"),
		DBPath:  os.Getenv("THREADMARK_DB_PATH"),
		DefaultModel: agentruntime.ModelSelection{
			ProviderID: strings.TrimSpace(os.Getenv("THREADMARK_DEFAULT_PROVIDER")),
			ModelID:    strings.TrimSpace(os.Getenv("THREADMARK_DEFAULT_MODEL")),
		},
	}
	if cfg.Addr == "" {
		cfg.Addr = "127.0.0.1:8090"
	}
	if cfg.DefaultModel.ProviderID == "" {
		cfg.DefaultModel.ProviderID = "deepseek"
	}
	if cfg.DefaultModel.ModelID == "" && cfg.DefaultModel.ProviderID == "deepseek" {
		cfg.DefaultModel.ModelID = strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL"))
		if cfg.DefaultModel.ModelID == "" {
			cfg.DefaultModel.ModelID = "deepseek-flash"
		}
	}
	if cfg.DefaultModel.ModelID == "" {
		return Config{}, fmt.Errorf("set THREADMARK_DEFAULT_MODEL for provider %q", cfg.DefaultModel.ProviderID)
	}
	effort, explicit := os.LookupEnv("THREADMARK_DEFAULT_EFFORT")
	if !explicit && cfg.DefaultModel.ProviderID == "deepseek" {
		effort = "high"
	}
	if effort = strings.TrimSpace(effort); effort != "" {
		cfg.DefaultModel.Thinking = &agentruntime.ThinkingOptions{Effort: effort}
	}
	var err error
	cfg.Providers, err = configuredProviders()
	if err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func configuredProviders() (map[string]ProviderConfig, error) {
	catalog, err := modelcatalog.Builtin()
	if err != nil {
		return nil, err
	}
	// These endpoints use protocols supported by the current model adapter.
	// MiniMax's catalog defaults to Anthropic; select its compatible API explicitly.
	defaults := map[string]ProviderConfig{
		"deepseek":              {API: openaimodel.APIChatCompletions},
		"moonshotai":            {API: openaimodel.APIChatCompletions},
		"moonshotai-cn":         {API: openaimodel.APIChatCompletions},
		"xiaomi":                {API: openaimodel.APIChatCompletions},
		"xiaomi-token-plan-cn":  {API: openaimodel.APIChatCompletions},
		"xiaomi-token-plan-sgp": {API: openaimodel.APIChatCompletions},
		"minimax":               {API: openaimodel.APIChatCompletions, BaseURL: "https://api.minimax.io/v1"},
		"minimax-cn":            {API: openaimodel.APIChatCompletions, BaseURL: "https://api.minimax.cn/v1"},
		"alibaba":               {API: openaimodel.APIChatCompletions},
		"alibaba-cn":            {API: openaimodel.APIChatCompletions},
		"opencode":              {API: openaimodel.APIChatCompletions},
		"openai":                {API: openaimodel.APIResponses, BaseURL: "https://api.openai.com/v1"},
	}
	configured := make(map[string]ProviderConfig)
	for id, connection := range defaults {
		provider, ok := catalog[id]
		if !ok {
			continue
		}
		for _, name := range provider.Env {
			key := strings.TrimSpace(os.Getenv(name))
			if key != "" && key != "your-api-key-here" {
				connection.APIKey = key
				break
			}
		}
		if connection.APIKey == "" {
			continue
		}
		if connection.BaseURL == "" {
			connection.BaseURL = provider.API
		}
		configured[id] = connection
	}
	return configured, nil
}

func dataDirectory() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	switch runtime.GOOS {
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "Threadmark"), nil
	case "windows":
		root := os.Getenv("LOCALAPPDATA")
		if root == "" {
			root = filepath.Join(home, "AppData", "Local")
		}
		return filepath.Join(root, "Threadmark"), nil
	default:
		root := os.Getenv("XDG_DATA_HOME")
		if !filepath.IsAbs(root) {
			root = filepath.Join(home, ".local", "share")
		}
		return filepath.Join(root, "threadmark"), nil
	}
}
