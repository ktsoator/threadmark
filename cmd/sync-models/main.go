// sync-models downloads the original models.dev JSON for local use.
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	sourceURL      = "https://models.dev/api.json"
	outputPath     = "internal/modelcatalog/data/models.json"
	maxSourceBytes = 32 << 20
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(sourceURL)
	if err != nil {
		return fmt.Errorf("download models: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download models: HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxSourceBytes+1))
	if err != nil {
		return fmt.Errorf("read models: %w", err)
	}
	if len(data) > maxSourceBytes {
		return fmt.Errorf("models response exceeds %d bytes", maxSourceBytes)
	}
	if !json.Valid(data) {
		return fmt.Errorf("models response is not valid JSON")
	}
	if err := save(data); err != nil {
		return fmt.Errorf("save models: %w", err)
	}
	fmt.Printf("Downloaded %d bytes to %s\n", len(data), outputPath)
	return nil
}

// Replace the old snapshot only after the download is validated and written.
func save(data []byte) error {
	dir := filepath.Dir(outputPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".models-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if err := f.Chmod(0644); err != nil {
		return err
	}
	if _, err := f.Write(data); err != nil {
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(f.Name(), outputPath)
}
