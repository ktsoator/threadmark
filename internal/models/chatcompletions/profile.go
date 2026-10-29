package chatcompletions

import (
	"fmt"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/packages/param"
	oaishared "github.com/openai/openai-go/v3/shared"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

type Provider string

const (
	DeepSeek Provider = "deepseek"
	Kimi     Provider = "kimi"
)

type ThinkingMode string

const (
	ThinkingEnabled  ThinkingMode = "enabled"
	ThinkingDisabled ThinkingMode = "disabled"
)

// These profiles cover DeepSeek's current thinking models and Kimi K3.
// An empty mode/effort uses the provider default; IncludeThoughts controls
// presentation elsewhere and never discards reasoning needed for subsequent requests.
func (cfg Config) validate() error {
	if cfg.Provider != DeepSeek && cfg.Provider != Kimi {
		return fmt.Errorf("chatcompletions: unsupported provider %q", cfg.Provider)
	}
	if cfg.Thinking != "" && cfg.Thinking != ThinkingEnabled && cfg.Thinking != ThinkingDisabled {
		return fmt.Errorf("chatcompletions: unsupported thinking mode %q", cfg.Thinking)
	}
	if cfg.Provider == Kimi && cfg.Thinking == ThinkingDisabled {
		return fmt.Errorf("chatcompletions: Kimi K3 requires thinking")
	}
	switch cfg.ReasoningEffort {
	case "", "low", "high", "max":
	default:
		return fmt.Errorf("chatcompletions: unsupported reasoning effort %q for %s", cfg.ReasoningEffort, cfg.Provider)
	}
	if cfg.Thinking == ThinkingDisabled && cfg.ReasoningEffort != "" {
		return fmt.Errorf("chatcompletions: reasoning effort requires thinking")
	}
	return nil
}

func (m *Model) applyProfile(params *openai.ChatCompletionNewParams, req *model.LLMRequest) error {
	if string(params.Model) != m.name {
		return fmt.Errorf("chatcompletions: model %q does not match configured model %q", params.Model, m.name)
	}
	cfg := m.config
	if req.Config != nil && req.Config.ThinkingConfig != nil {
		thinking := req.Config.ThinkingConfig
		switch thinking.ThinkingLevel {
		case "", genai.ThinkingLevelUnspecified:
		case genai.ThinkingLevelLow:
			cfg.Thinking, cfg.ReasoningEffort = ThinkingEnabled, "low"
		case genai.ThinkingLevelHigh:
			cfg.Thinking, cfg.ReasoningEffort = ThinkingEnabled, "high"
		default:
			return fmt.Errorf("chatcompletions: unsupported thinking level %q for %s", thinking.ThinkingLevel, cfg.Provider)
		}
		if budget := thinking.ThinkingBudget; budget != nil {
			if thinking.ThinkingLevel != "" && thinking.ThinkingLevel != genai.ThinkingLevelUnspecified {
				return fmt.Errorf("chatcompletions: configure either thinking level or budget, not both")
			}
			switch *budget {
			case 0:
				cfg.Thinking, cfg.ReasoningEffort = ThinkingDisabled, ""
			case -1:
				cfg.Thinking, cfg.ReasoningEffort = ThinkingEnabled, ""
			default:
				return fmt.Errorf("chatcompletions: token thinking budgets are unsupported; use reasoning effort")
			}
		}
	}
	if err := cfg.validate(); err != nil {
		return err
	}
	if cfg.Provider == DeepSeek {
		if params.ResponseFormat.OfJSONSchema != nil {
			return fmt.Errorf("%w: DeepSeek does not support response_format=json_schema (ResponseSchema or ResponseJsonSchema); use ResponseMIMEType=application/json without a schema", ErrUnsupportedConfigField)
		}
		if cfg.Thinking != "" {
			params.SetExtraFields(map[string]any{"thinking": map[string]string{"type": string(cfg.Thinking)}})
		}
	}
	if req.Config != nil && req.Config.MaxOutputTokens > 0 {
		limit := param.NewOpt(int64(req.Config.MaxOutputTokens))
		if cfg.Provider == DeepSeek {
			params.MaxTokens = limit
		} else {
			params.MaxCompletionTokens = limit
		}
	}
	params.ReasoningEffort = oaishared.ReasoningEffort(cfg.ReasoningEffort)
	return nil
}
