// print-models prints parsed catalog entries for a provider, defaulting to DeepSeek.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"maps"
	"os"
	"slices"

	"github.com/ktsoator/threadmark/internal/modelcatalog"
)

func main() {
	path := flag.String("file", "", "Optional models.dev JSON file; defaults to the embedded catalog")
	providerID := flag.String("provider", "deepseek", "Provider ID to print")
	flag.Parse()
	if err := run(*path, *providerID); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(path, providerID string) error {
	catalog, err := loadCatalog(path)
	if err != nil {
		return err
	}
	provider, ok := catalog[providerID]
	if !ok {
		return fmt.Errorf("provider %q not found in catalog", providerID)
	}
	models := make([]modelcatalog.Model, 0, len(provider.Models))
	for _, id := range slices.Sorted(maps.Keys(provider.Models)) {
		models = append(models, provider.Models[id])
	}
	// Print the decoded structs for inspection, not a lossless source snapshot.
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(models); err != nil {
		return fmt.Errorf("print models: %w", err)
	}
	return nil
}

func loadCatalog(path string) (modelcatalog.Catalog, error) {
	if path == "" {
		return modelcatalog.Builtin()
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open catalog: %w", err)
	}
	defer f.Close()
	return modelcatalog.Load(f)
}
