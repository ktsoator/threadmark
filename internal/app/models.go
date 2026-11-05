package app

import (
	"context"
	"fmt"
	"maps"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/ktsoator/threadmark/internal/runtime"
	"github.com/ktsoator/threadmark/model/openaimodel"
	"github.com/ktsoator/threadmark/modelcatalog"
	"google.golang.org/adk/v2/model"
)

// ProviderConfig supplies connection settings independently of model metadata.
type ProviderConfig struct {
	APIKey  string
	BaseURL string
	API     openaimodel.API
}

func prepareModels(cfg Config) (*runtime.ModelList, runtime.ModelFactory, error) {
	catalog, err := modelcatalog.Builtin()
	if err != nil {
		return nil, nil, err
	}
	providers := maps.Clone(cfg.Providers)
	defaultSelection := cfg.DefaultModel
	if defaultSelection.Thinking != nil {
		thinking := *defaultSelection.Thinking
		if thinking.Enabled != nil {
			enabled := *thinking.Enabled
			thinking.Enabled = &enabled
		}
		defaultSelection.Thinking = &thinking
	}
	for id, connection := range providers {
		if _, ok := catalog[id]; !ok {
			return nil, nil, fmt.Errorf("unknown provider %q", id)
		}
		endpoint, err := url.Parse(connection.BaseURL)
		if err != nil || endpoint.Host == "" || (endpoint.Scheme != "http" && endpoint.Scheme != "https") {
			return nil, nil, fmt.Errorf("invalid endpoint for provider %q", id)
		}
		if strings.TrimSpace(connection.APIKey) == "" || (connection.API != openaimodel.APIChatCompletions && connection.API != openaimodel.APIResponses) {
			return nil, nil, fmt.Errorf("API key and supported API type are required for provider %q", id)
		}
	}
	list := &runtime.ModelList{DefaultSelection: defaultSelection, Providers: []runtime.ModelProvider{}}
	for _, provider := range catalog.Providers() {
		item := runtime.ModelProvider{ID: provider.ID, Name: provider.Name, Models: []runtime.ModelOption{}}
		models, _ := catalog.Models(provider.ID)
		for _, info := range models {
			controls := make([]runtime.ReasoningControl, 0, len(info.ReasoningOptions))
			for _, control := range info.ReasoningOptions {
				controls = append(controls, runtime.ReasoningControl{
					Type: control.Type, Values: control.Values, Min: control.Min, Max: control.Max,
				})
			}
			item.Models = append(item.Models, runtime.ModelOption{
				ID: info.ID, Name: info.Name, ReasoningOptions: controls,
			})
		}
		list.Providers = append(list.Providers, item)
	}
	client := &http.Client{Timeout: 90 * time.Second}
	newModel := func(ctx context.Context, selection *runtime.ModelSelection) (model.LLM, error) {
		if selection == nil {
			selection = &defaultSelection
		}
		info, ok := catalog.Lookup(selection.ProviderID, selection.ModelID)
		if !ok {
			return nil, fmt.Errorf("%w Provider/model %q/%q is not available.", runtime.ErrInvalidModel, selection.ProviderID, selection.ModelID)
		}
		connection, ok := providers[selection.ProviderID]
		if !ok {
			return nil, fmt.Errorf("%w Provider %q is not configured.", runtime.ErrInvalidModel, selection.ProviderID)
		}
		var thinking openaimodel.ThinkingOptions
		if selection.Thinking != nil {
			thinking.Enabled = selection.Thinking.Enabled
			thinking.Effort = selection.Thinking.Effort
		}
		options, err := openaimodel.BuildThinkingOptions(selection.ProviderID, info, connection.API, thinking)
		if err != nil {
			return nil, fmt.Errorf("%w %v", runtime.ErrInvalidModel, err)
		}
		return openaimodel.NewConfiguredModel(ctx, openaimodel.ModelConfig{Metadata: info}, &openaimodel.ClientConfig{
			API: connection.API, APIKey: connection.APIKey, BaseURL: connection.BaseURL,
			HTTPClient: client, Options: options,
		})
	}
	// Validate the default through the same path used by individual requests.
	if _, err := newModel(context.Background(), nil); err != nil {
		return nil, nil, fmt.Errorf("default model: %w", err)
	}
	return list, newModel, nil
}
