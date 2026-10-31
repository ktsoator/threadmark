package openaimodel

import (
	"context"

	"github.com/ktsoator/threadmark/internal/modelcatalog"
	"google.golang.org/adk/v2/model"
)

// ModelConfig supplies model metadata independently of connection settings.
type ModelConfig struct {
	// Metadata comes from an explicit catalog lookup by the caller.
	// ID selects the model. Interleaved supplies an optional Chat Completions
	// response field for reasoning; other fields are not currently used.
	Metadata modelcatalog.Model
}

// NewConfiguredModel creates a model using the supplied metadata and client settings.
// It retains only the model ID and reasoning field name, without a catalog lookup.
// Reading reasoning responses does not enable reasoning in requests.
func NewConfiguredModel(_ context.Context, cfg ModelConfig, clientCfg *ClientConfig) (model.LLM, error) {
	var reasoningField string
	if interleaved := cfg.Metadata.Interleaved; interleaved != nil && interleaved.Enabled {
		reasoningField = interleaved.Field
	}
	return newModel(cfg.Metadata.ID, clientCfg, reasoningField)
}
