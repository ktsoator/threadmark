// Package chatcompletions adapts DeepSeek and Kimi text and function-tool
// conversations to ADK, including reasoning_content and assistant history.
package chatcompletions

import (
	"context"
	"fmt"
	"iter"
	"net/http"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"google.golang.org/adk/v2/model"
)

// Config configures one provider/model instance. Credentials are explicit to
// avoid inheriting an unrelated OPENAI_API_KEY or OPENAI_BASE_URL.
type Config struct {
	Provider        Provider
	APIKey          string
	BaseURL         string
	HTTPClient      *http.Client
	Thinking        ThinkingMode
	ReasoningEffort string
}

type Model struct {
	client openai.Client
	name   string
	config Config
}

var _ model.LLM = (*Model)(nil)

func New(modelName string, cfg Config) (*Model, error) {
	if strings.TrimSpace(modelName) == "" {
		return nil, fmt.Errorf("chatcompletions: model name is required")
	}
	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, fmt.Errorf("chatcompletions: API key is required")
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	if cfg.BaseURL == "" {
		switch cfg.Provider {
		case DeepSeek:
			cfg.BaseURL = "https://api.deepseek.com"
		case Kimi:
			cfg.BaseURL = "https://api.moonshot.cn/v1"
		}
	}
	opts := []option.RequestOption{option.WithAPIKey(cfg.APIKey), option.WithBaseURL(cfg.BaseURL)}
	if cfg.HTTPClient != nil {
		opts = append(opts, option.WithHTTPClient(cfg.HTTPClient))
	}
	return &Model{client: openai.NewClient(opts...), name: modelName, config: cfg}, nil
}

func (m *Model) Name() string { return m.name }

func (m *Model) GenerateContent(ctx context.Context, req *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		ctx := ctx
		params, err := buildParams(m.name, req)
		if err == nil {
			err = m.applyProfile(&params, req)
		}
		if err != nil {
			yield(nil, err)
			return
		}
		if timeout := requestTimeout(req.Config); timeout > 0 {
			var cancel context.CancelFunc
			ctx, cancel = context.WithTimeout(ctx, timeout)
			defer cancel()
		}
		if stream {
			m.generateStream(ctx, params, yield)
			return
		}
		completion, err := m.client.Chat.Completions.New(ctx, params)
		if err != nil {
			yield(nil, fmt.Errorf("chatcompletions: request failed: %w", err))
			return
		}
		response, err := convertResponse(completion, nil)
		yield(response, err)
	}
}
