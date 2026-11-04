package app

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// Config holds the settings used to assemble the local application.
type Config struct {
	Addr      string
	DataDir   string
	DBPath    string
	APIKey    string
	ModelName string
}

func LoadConfig() (Config, error) {
	cfg := Config{
		Addr:      strings.TrimSpace(os.Getenv("THREADMARK_ADDR")),
		DataDir:   os.Getenv("THREADMARK_DATA_DIR"),
		DBPath:    os.Getenv("THREADMARK_DB_PATH"),
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
