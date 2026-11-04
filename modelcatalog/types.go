// Package modelcatalog reads model metadata from models.dev snapshots.
// Catalog declarations do not imply adapter support or account access.
package modelcatalog

import "encoding/json"

// Catalog is keyed by provider ID; each provider's Models is keyed by model ID.
type Catalog map[string]Provider

type Provider struct {
	ID     string           `json:"id"`
	Name   string           `json:"name"`
	Env    []string         `json:"env"`
	NPM    string           `json:"npm"`
	API    string           `json:"api"`
	Doc    string           `json:"doc"`
	Models map[string]Model `json:"models"`
}

// Model describes source metadata, not connection settings or request defaults.
// Nil capability pointers mean unknown; false means explicitly unsupported.
type Model struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Description      string `json:"description"`
	Family           string `json:"family"`
	CanonicalModelID string `json:"canonical_model_id"`

	Attachment       *bool `json:"attachment"`
	Reasoning        *bool `json:"reasoning"`
	ToolCall         *bool `json:"tool_call"`
	StructuredOutput *bool `json:"structured_output"`
	Temperature      *bool `json:"temperature"`
	OpenWeights      *bool `json:"open_weights"`

	ReasoningOptions []ReasoningOption `json:"reasoning_options"`
	Interleaved      *Interleaved      `json:"interleaved"`
	Modalities       Modalities        `json:"modalities"`
	Limit            Limits            `json:"limit"`
	Cost             *Cost             `json:"cost"`
	Provider         *ModelProvider    `json:"provider"`

	Knowledge   string `json:"knowledge"`
	ReleaseDate string `json:"release_date"`
	LastUpdated string `json:"last_updated"`
	Status      string `json:"status"`
}

type Modalities struct {
	Input  []string `json:"input"`
	Output []string `json:"output"`
}

// Limits preserves source values, including zero. Nil means unspecified.
type Limits struct {
	Context *int64 `json:"context"`
	Input   *int64 `json:"input"`
	Output  *int64 `json:"output"`
}

// ReasoningOption describes a control, not the selection for a request.
// Type is open-ended so new source option types can still be loaded.
type ReasoningOption struct {
	Type   string   `json:"type"`
	Values []string `json:"values"`
	Min    *int64   `json:"min"`
	Max    *int64   `json:"max"`
}

// Interleaved is the decoded boolean or field-object declaration.
// Field is empty for a boolean declaration. This type is for reading metadata;
// it does not define how reasoning is encoded in a model request.
type Interleaved struct {
	Enabled bool
	Field   string
}

// Rates contains reference USD prices per million tokens. Nil means unknown;
// a pointer to zero means a known zero price.
type Rates struct {
	Input       *float64 `json:"input"`
	Output      *float64 `json:"output"`
	Reasoning   *float64 `json:"reasoning"`
	CacheRead   *float64 `json:"cache_read"`
	CacheWrite  *float64 `json:"cache_write"`
	InputAudio  *float64 `json:"input_audio"`
	OutputAudio *float64 `json:"output_audio"`
}

type Cost struct {
	Rates
	Tiers           []PriceTier `json:"tiers"`
	ContextOver200K *Rates      `json:"context_over_200k"`
}

type PriceTier struct {
	Rates
	Tier TierBoundary `json:"tier"`
}

type TierBoundary struct {
	Type string `json:"type"`
	Size *int64 `json:"size"`
}

// ModelProvider holds optional model-specific provider metadata.
// Shape is retained without interpreting SDK-specific configuration.
type ModelProvider struct {
	API   string          `json:"api"`
	NPM   string          `json:"npm"`
	Shape json.RawMessage `json:"shape"`
}
