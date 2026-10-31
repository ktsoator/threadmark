package openaimodel

import (
	"context"

	"github.com/ktsoator/threadmark/internal/modelcatalog"
	"google.golang.org/adk/v2/model"
)

// ModelConfig supplies model metadata independently of connection settings.
type ModelConfig struct {
	// Metadata comes from an explicit catalog lookup by the caller.
	// Only ID is currently used; other fields do not affect request behavior.
	Metadata modelcatalog.Model
}

// NewConfiguredModel creates a model using the supplied metadata and client settings.
// It performs no catalog lookup and retains only the model ID through NewModel.
// Reasoning controls must be set explicitly through client request options.
func NewConfiguredModel(ctx context.Context, cfg ModelConfig, clientCfg *ClientConfig) (model.LLM, error) {
	return NewModel(ctx, cfg.Metadata.ID, clientCfg)
}
