package openaimodel

import (
	"fmt"
	"slices"

	"github.com/ktsoator/threadmark/internal/modelcatalog"
	"github.com/openai/openai-go/v3/option"
)

// ThinkingOptions contains explicit user selections, independent of model capabilities.
// Zero values leave the provider's defaults unchanged.
type ThinkingOptions struct {
	// Enabled selects a toggle. Nil leaves the toggle unspecified.
	Enabled *bool
	// Effort must match a value declared by the model's effort control.
	Effort string
}

// BuildThinkingOptions validates selections against supplied catalog metadata and
// creates ClientConfig.Options for the official DeepSeek, Kimi, MiMo, MiniMax,
// and Qwen endpoints. Nonempty selections require APIChatCompletions explicitly;
// an empty API still means Responses and is not mapped by this helper.
// providerID identifies the endpoint, not the model's originating lab. Catalog
// controls determine whether a model supports a toggle and which efforts it accepts.
// Empty selections preserve endpoint defaults, including for other providers.
// This function performs no catalog lookup or automatic API or endpoint selection.
func BuildThinkingOptions(providerID string, metadata modelcatalog.Model, api API, selection ThinkingOptions) ([]option.RequestOption, error) {
	if err := validateThinkingOptions(metadata, selection); err != nil {
		return nil, fmt.Errorf("openai: thinking options for %q/%q: %w", providerID, metadata.ID, err)
	}
	if selection.Enabled == nil && selection.Effort == "" {
		return nil, nil
	}
	switch api {
	case APIChatCompletions:
	case "", APIResponses:
		return nil, fmt.Errorf("openai: automatic thinking options currently require APIChatCompletions; Responses mapping is not configured")
	default:
		return nil, fmt.Errorf("%w: %q", ErrUnsupportedAPI, api)
	}

	toggleField := "thinking.type"
	var enabledValue any = "enabled"
	var disabledValue any = "disabled"
	switch providerID {
	case "deepseek":
		// https://api-docs.deepseek.com/guides/thinking_mode/
	case "moonshotai", "moonshotai-cn":
		// K2.6 declares a toggle; K3 only declares effort controls in the catalog.
		// https://platform.kimi.com/docs/api/chat
	case "xiaomi", "xiaomi-token-plan-cn", "xiaomi-token-plan-sgp":
		// MiMo declares a toggle, with no effort levels in the current catalog.
		// https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/text-generation/deep-thinking
	case "minimax", "minimax-cn", "minimax-coding-plan", "minimax-cn-coding-plan":
		// MiniMax uses adaptive, not enabled. M3 declares a toggle; M3.1 declares
		// effort levels, while M2.x has no selectable controls.
		// https://platform.minimax.cn/docs/api-reference/text-openai-api
		enabledValue = "adaptive"
	case "alibaba", "alibaba-cn":
		// https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions
		toggleField = "enable_thinking"
		enabledValue = true
		disabledValue = false
	default:
		return nil, fmt.Errorf("openai: no automatic thinking mapping for provider %q; use ClientConfig.Options for an explicit mapping", providerID)
	}

	var options []option.RequestOption
	if selection.Enabled != nil {
		toggleValue := disabledValue
		if *selection.Enabled {
			toggleValue = enabledValue
		}
		options = append(options, option.WithJSONSet(toggleField, toggleValue))
	}
	if selection.Effort != "" {
		options = append(options, option.WithJSONSet("reasoning_effort", selection.Effort))
	}
	return options, nil
}

func validateThinkingOptions(metadata modelcatalog.Model, selection ThinkingOptions) error {
	if selection.Enabled == nil && selection.Effort == "" {
		return nil
	}
	if selection.Enabled != nil && !*selection.Enabled && selection.Effort != "" {
		return fmt.Errorf("cannot select effort while disabling thinking")
	}
	if selection.Enabled != nil && *selection.Enabled && selection.Effort == "none" {
		return fmt.Errorf("cannot enable thinking with effort %q", selection.Effort)
	}
	if metadata.Reasoning != nil && !*metadata.Reasoning {
		return fmt.Errorf("catalog declares reasoning unsupported")
	}

	var toggle bool
	var effort *modelcatalog.ReasoningOption
	for i := range metadata.ReasoningOptions {
		control := &metadata.ReasoningOptions[i]
		switch control.Type {
		case "toggle":
			toggle = true
		case "effort":
			effort = control
		}
	}
	if selection.Enabled != nil && !toggle {
		return fmt.Errorf("catalog does not declare a toggle control")
	}
	if selection.Effort != "" {
		if effort == nil || len(effort.Values) == 0 {
			return fmt.Errorf("catalog does not declare allowed effort values")
		}
		if !slices.Contains(effort.Values, selection.Effort) {
			return fmt.Errorf("effort %q is not allowed; expected one of %v", selection.Effort, effort.Values)
		}
	}
	return nil
}
