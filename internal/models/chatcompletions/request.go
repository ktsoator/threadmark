// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Adapted from google.golang.org/adk/v2 v2.6.0, model/openaimodel/internal/completions/request.go.
// Adapted for Threadmark's Chat Completions adapter.
package chatcompletions

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/packages/param"
	oaishared "github.com/openai/openai-go/v3/shared"
	"google.golang.org/genai"

	"google.golang.org/adk/v2/model"
)

// The message roles Chat Completions accepts from a caller. The tool role is
// absent on purpose: it comes from a function response, never from a content
// role.
const (
	roleUser      = "user"
	roleAssistant = "assistant"
	roleSystem    = "system"
	roleDeveloper = "developer"
)

// buildParams converts a generic LLMRequest into Chat Completions request
// params.
func buildParams(modelName string, req *model.LLMRequest) (openai.ChatCompletionNewParams, error) {
	if req == nil {
		return openai.ChatCompletionNewParams{}, ErrRequestNil
	}

	params := openai.ChatCompletionNewParams{Model: oaishared.ChatModel(modelName)}
	if req.Model != "" {
		params.Model = oaishared.ChatModel(req.Model)
	}

	messages, err := convertContents(req.Contents)
	if err != nil {
		return openai.ChatCompletionNewParams{}, err
	}
	if len(messages) == 0 {
		return openai.ChatCompletionNewParams{}, ErrNoContents
	}
	params.Messages = messages

	// Runs after the messages exist, because the system instruction joins them
	// as the first one rather than as a field of its own.
	if err := applyGenerationConfig(&params, req.Config); err != nil {
		return openai.ChatCompletionNewParams{}, err
	}

	tools, err := convertTools(req.Config)
	if err != nil {
		return openai.ChatCompletionNewParams{}, err
	}
	if len(tools) > 0 {
		params.Tools = tools
	}

	if cfg := req.Config; cfg != nil && cfg.ToolConfig != nil {
		choice, err := convertToolChoice(cfg.ToolConfig)
		if err != nil {
			return openai.ChatCompletionNewParams{}, err
		}
		// Only alongside tools: the API rejects a tool_choice sent without
		// them, "none" included, so a turn whose toolset came up empty would
		// fail. adk-python's LiteLLM path drops it in the same case.
		if choice != nil && len(tools) > 0 {
			params.ToolChoice = *choice
		}
	}

	return params, nil
}

// convertContents converts ADK contents into a Chat Completions message
// list. One content can produce several messages, because a tool result is a
// message of its own rather than a part of the turn that carried it.
func convertContents(contents []*genai.Content) ([]openai.ChatCompletionMessageParamUnion, error) {
	var (
		messages []openai.ChatCompletionMessageParamUnion
		tracker  callTracker
	)
	for _, content := range contents {
		if content == nil || len(content.Parts) == 0 {
			continue
		}
		converted, err := convertContent(content, &tracker)
		if err != nil {
			return nil, err
		}
		messages = append(messages, converted...)
	}
	return messages, nil
}

// convertContent converts one content into the messages it becomes: a tool
// message per function response, then at most one message for the rest.
func convertContent(content *genai.Content, tracker *callTracker) ([]openai.ChatCompletionMessageParamUnion, error) {
	role, err := normalizeRole(genai.Role(content.Role))
	if err != nil {
		return nil, err
	}

	var (
		messages   []openai.ChatCompletionMessageParamUnion
		texts      []string
		thoughts   []string
		hasThought bool
		calls      []openai.ChatCompletionMessageToolCallUnionParam
	)
	for _, part := range content.Parts {
		if part == nil {
			continue
		}
		// Checked first, so a field this package cannot send is named even when
		// text or a call on the same part would otherwise carry it out unnoticed.
		if field := unsupportedPayload(part); field != "" {
			return nil, fmt.Errorf("openai: unsupported content part: %s", field)
		}
		// Reasoning stays separate from answer text, including on tool turns.
		if part.Thought {
			if role != roleAssistant {
				return nil, fmt.Errorf("chatcompletions: reasoning requires a model turn")
			}
			hasThought = true
			thoughts = append(thoughts, part.Text)
		}
		sendText := part.Text != "" && !part.Thought
		if sendText {
			texts = append(texts, part.Text)
		}
		switch {
		case part.FunctionCall != nil:
			call, err := newToolCall(tracker, part.FunctionCall)
			if err != nil {
				return nil, err
			}
			calls = append(calls, *call)
		case part.FunctionResponse != nil:
			msg, err := newToolMessage(tracker, part.FunctionResponse)
			if err != nil {
				return nil, err
			}
			messages = append(messages, *msg)
		case !sendText && !part.Thought:
			return nil, errors.New("openai: unsupported content part: carries nothing to send")
		}
	}
	if len(calls) > 0 && role != roleAssistant {
		// Only an assistant message carries tool calls, and dropping them would
		// leave their results answering calls the request never made.
		return nil, fmt.Errorf("openai: function call in a %s turn: only model turns can carry calls", role)
	}

	text := joinText(texts)
	switch {
	case role == roleAssistant:
		if text == "" && len(calls) == 0 && !hasThought {
			break
		}
		msg := openai.ChatCompletionAssistantMessageParam{ToolCalls: calls}
		if hasThought {
			msg.SetExtraFields(map[string]any{"reasoning_content": strings.Join(thoughts, "")})
		}
		if text != "" {
			msg.Content.OfString = param.NewOpt(text)
		}
		messages = append(messages, openai.ChatCompletionMessageParamUnion{OfAssistant: &msg})
	case text == "":
	case role == roleSystem:
		messages = append(messages, openai.SystemMessage(text))
	case role == roleDeveloper:
		messages = append(messages, openai.DeveloperMessage(text))
	default:
		messages = append(messages, openai.UserMessage(text))
	}
	return messages, nil
}

// normalizeRole maps a genai content role onto a Chat Completions message role. The
// system and developer roles survive rather than folding into user, which is
// what adk-python's LiteLLM path does, because Chat Completions has both.
func normalizeRole(role genai.Role) (string, error) {
	switch role {
	case "", genai.RoleUser:
		return roleUser, nil
	case genai.RoleModel:
		return roleAssistant, nil
	case roleSystem:
		return roleSystem, nil
	case roleDeveloper:
		return roleDeveloper, nil
	default:
		return "", fmt.Errorf("openai: unsupported role %q", role)
	}
}

// joinText flattens a turn's text parts into the one string a Chat
// Completions message carries, dropping parts holding only whitespace.
func joinText(texts []string) string {
	var b strings.Builder
	for _, text := range texts {
		if strings.TrimSpace(text) == "" {
			continue
		}
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString(text)
	}
	return b.String()
}

// newToolCall converts a function call into the tool call an assistant
// message carries.
func newToolCall(tracker *callTracker, fc *genai.FunctionCall) (*openai.ChatCompletionMessageToolCallUnionParam, error) {
	if fc.Name == "" {
		return nil, ErrFunctionCallMissingName
	}
	callID := tracker.TakeCallID(fc)
	args, err := marshalFunctionArgs(fc.Args)
	if err != nil {
		return nil, err
	}
	return &openai.ChatCompletionMessageToolCallUnionParam{
		OfFunction: &openai.ChatCompletionMessageFunctionToolCallParam{
			ID: callID,
			Function: openai.ChatCompletionMessageFunctionToolCallFunctionParam{
				Name:      fc.Name,
				Arguments: args,
			},
		},
	}, nil
}

// newToolMessage converts a function response into the tool-role message
// that answers its call.
func newToolMessage(tracker *callTracker, fr *genai.FunctionResponse) (*openai.ChatCompletionMessageParamUnion, error) {
	callID, err := tracker.ResolveResponseID(fr)
	if err != nil {
		return nil, err
	}
	payload, err := json.Marshal(fr.Response)
	if err != nil {
		return nil, fmt.Errorf("openai: marshal function response: %w", err)
	}
	msg := openai.ToolMessage(string(payload), callID)
	return &msg, nil
}

// serviceTiers maps genai's processing tiers onto the Chat Completions
// equivalents.
var serviceTiers = map[genai.ServiceTier]openai.ChatCompletionNewParamsServiceTier{
	genai.ServiceTierUnspecified: openai.ChatCompletionNewParamsServiceTierDefault,
	genai.ServiceTierStandard:    openai.ChatCompletionNewParamsServiceTierDefault,
	genai.ServiceTierFlex:        openai.ChatCompletionNewParamsServiceTierFlex,
	genai.ServiceTierPriority:    openai.ChatCompletionNewParamsServiceTierPriority,
}

// applyGenerationConfig translates the generation config onto Chat
// Completions params. Stop sequences, the penalties and seed are translated
// here using their Chat Completions names.
func applyGenerationConfig(params *openai.ChatCompletionNewParams, cfg *genai.GenerateContentConfig) error {
	if cfg == nil {
		return nil
	}
	if cfg.Temperature != nil {
		params.Temperature = param.NewOpt(float64(*cfg.Temperature))
	}
	if cfg.TopP != nil {
		params.TopP = param.NewOpt(float64(*cfg.TopP))
	}
	if cfg.TopK != nil {
		// Chat Completions has no top_k either, and forwarding it would trade a
		// clear error for a field the provider ignores.
		return ErrTopKNotSupported
	}
	if len(cfg.StopSequences) > 0 {
		// Sent whatever its length: OpenAI documents a limit of four, but
		// compatible providers differ, and a 400 naming the field diagnoses it
		// better than a guess made here.
		params.Stop = openai.ChatCompletionNewParamsStopUnion{OfStringArray: cfg.StopSequences}
	}
	if cfg.CandidateCount > 1 {
		// The API has "n", but a genai response carries one candidate and the
		// rest of this package assumes it.
		return ErrMultipleCandidatesNotSupported
	}
	if cfg.FrequencyPenalty != nil {
		params.FrequencyPenalty = param.NewOpt(float64(*cfg.FrequencyPenalty))
	}
	if cfg.PresencePenalty != nil {
		params.PresencePenalty = param.NewOpt(float64(*cfg.PresencePenalty))
	}
	if cfg.Seed != nil {
		params.Seed = param.NewOpt(int64(*cfg.Seed))
	}
	if cfg.ResponseLogprobs {
		// top_logprobs is refused without this, so it is set whenever logprobs
		// are asked for at all.
		params.Logprobs = param.NewOpt(true)
		if cfg.Logprobs != nil {
			params.TopLogprobs = param.NewOpt(int64(*cfg.Logprobs))
		}
	}
	if cfg.SystemInstruction != nil {
		inst, err := flattenContentText(cfg.SystemInstruction)
		if err != nil {
			return fmt.Errorf("openai: system instruction: %w", err)
		}
		if inst != "" {
			// There is no instructions field here, so the instruction leads the
			// conversation as a system message.
			params.Messages = append([]openai.ChatCompletionMessageParamUnion{openai.SystemMessage(inst)}, params.Messages...)
		}
	}
	if cfg.ResponseMIMEType != "" && cfg.ResponseMIMEType != "text/plain" && cfg.ResponseMIMEType != "application/json" {
		return fmt.Errorf("%w: %s", ErrUnsupportedMIMEType, cfg.ResponseMIMEType)
	}
	if cfg.ResponseMIMEType == "application/json" || cfg.ResponseSchema != nil || cfg.ResponseJsonSchema != nil {
		format, err := newResponseFormat(cfg)
		if err != nil {
			return err
		}
		params.ResponseFormat = *format
	}
	if cfg.Labels != nil {
		return ErrLabelsNotSupported
	}
	if cfg.SafetySettings != nil {
		return ErrSafetySettingsNotSupported
	}
	if cfg.ServiceTier != "" {
		tier, ok := serviceTiers[cfg.ServiceTier]
		if !ok {
			return fmt.Errorf("%w: ServiceTier %q", ErrUnsupportedConfigField, cfg.ServiceTier)
		}
		params.ServiceTier = tier
	}
	if err := rejectUntranslatableValues(cfg); err != nil {
		return err
	}
	// Last, so the named errors above win when a caller sets both.
	return rejectConfigFields(unsupportedConfigFields, cfg)
}

// newResponseFormat builds the response_format Chat Completions takes,
// preserving the caller's JSON schema.
func newResponseFormat(cfg *genai.GenerateContentConfig) (*openai.ChatCompletionNewParamsResponseFormatUnion, error) {
	if cfg.ResponseSchema == nil && cfg.ResponseJsonSchema == nil {
		obj := oaishared.NewResponseFormatJSONObjectParam()
		return &openai.ChatCompletionNewParamsResponseFormatUnion{OfJSONObject: &obj}, nil
	}
	var (
		schema map[string]any
		err    error
	)
	if cfg.ResponseJsonSchema != nil {
		schema, err = normalizeSchema(cfg.ResponseJsonSchema)
	} else {
		schema, err = schemaToMap(cfg.ResponseSchema)
	}
	if err != nil {
		return nil, err
	}
	enforceStrictOpenAISchema(schema)
	name := "adk_response"
	if cfg.ResponseSchema != nil && cfg.ResponseSchema.Title != "" {
		name = cfg.ResponseSchema.Title
	}
	return &openai.ChatCompletionNewParamsResponseFormatUnion{
		OfJSONSchema: &oaishared.ResponseFormatJSONSchemaParam{
			JSONSchema: oaishared.ResponseFormatJSONSchemaJSONSchemaParam{
				Name:   name,
				Schema: schema,
				Strict: param.NewOpt(true),
			},
		},
	}, nil
}
