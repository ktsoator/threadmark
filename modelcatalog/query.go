package modelcatalog

import (
	"maps"
	"slices"
)

// Providers returns providers sorted by provider ID (the catalog map key).
// The returned slice is new, but nested data is shared with the catalog.
func (c Catalog) Providers() []Provider {
	providers := make([]Provider, 0, len(c))
	for _, id := range slices.Sorted(maps.Keys(c)) {
		providers = append(providers, c[id])
	}
	return providers
}

// Models returns models sorted by model ID (the provider's model map key).
// The boolean reports whether the provider exists, even if it has no models.
// The returned slice is new, but nested data is shared with the catalog.
func (c Catalog) Models(providerID string) ([]Model, bool) {
	provider, ok := c[providerID]
	if !ok {
		return nil, false
	}
	models := make([]Model, 0, len(provider.Models))
	for _, id := range slices.Sorted(maps.Keys(provider.Models)) {
		models = append(models, provider.Models[id])
	}
	return models, true
}

// Lookup returns a model by provider and model ID.
// The boolean reports whether the model exists.
// The returned model shares nested data with the catalog.
func (c Catalog) Lookup(providerID, modelID string) (Model, bool) {
	provider, ok := c[providerID]
	if !ok {
		return Model{}, false
	}
	model, ok := provider.Models[modelID]
	return model, ok
}
