package runtime

import (
	"context"
	"errors"

	"google.golang.org/adk/v2/model"
)

var ErrInvalidModel = errors.New("Invalid model selection.")

// ModelSelection identifies the provider endpoint, model and options for one run.
type ModelSelection struct {
	ProviderID string           `json:"providerId"`
	ModelID    string           `json:"modelId"`
	Thinking   *ThinkingOptions `json:"thinking,omitempty"`
}

type ThinkingOptions struct {
	Enabled *bool  `json:"enabled,omitempty"`
	Effort  string `json:"effort,omitempty"`
}

// ModelFactory uses the application default when selection is nil.
type ModelFactory func(context.Context, *ModelSelection) (model.LLM, error)

// ModelList contains the full catalog, independently of connection configuration.
type ModelList struct {
	DefaultSelection ModelSelection  `json:"defaultSelection"`
	Providers        []ModelProvider `json:"providers"`
}

type ModelProvider struct {
	ID     string        `json:"id"`
	Name   string        `json:"name"`
	Models []ModelOption `json:"models"`
}

type ModelOption struct {
	ID               string             `json:"id"`
	Name             string             `json:"name"`
	ReasoningOptions []ReasoningControl `json:"reasoningOptions"`
}

type ReasoningControl struct {
	Type   string   `json:"type"`
	Values []string `json:"values,omitempty"`
	Min    *int64   `json:"min,omitempty"`
	Max    *int64   `json:"max,omitempty"`
}
