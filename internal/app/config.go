package app

import (
	"fmt"
	"os"
	"strings"
)

// Config holds the settings used to assemble the local application.
type Config struct {
	Addr      string
	WorkDir   string
	APIKey    string
	ModelName string
}

func LoadConfig() (Config, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return Config{}, fmt.Errorf("get working directory: %w", err)
	}

	cfg := Config{
		Addr:      strings.TrimSpace(os.Getenv("THREADMARK_ADDR")),
		WorkDir:   cwd,
		APIKey:    strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY")),
		ModelName: strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL")),
	}
	if cfg.Addr == "" {
		cfg.Addr = "127.0.0.1:8090"
	}
	if cfg.ModelName == "" {
		cfg.ModelName = "deepseek-flash"
	}
	if cfg.APIKey == "" || cfg.APIKey == "your-api-key-here" {
		return Config{}, fmt.Errorf("set DEEPSEEK_API_KEY before starting the server")
	}

	return cfg, nil
}
