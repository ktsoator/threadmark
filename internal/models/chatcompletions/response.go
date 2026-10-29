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

// Adapted from google.golang.org/adk/v2 v2.6.0, model/openaimodel/internal/completions/response.go.
// Adapted for Threadmark's Chat Completions adapter.
package chatcompletions

import (
	"encoding/json"
	"fmt"
	"math"

	"github.com/openai/openai-go/v3"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func safeInt32(value int64) int32 {
	if value > math.MaxInt32 {
		return math.MaxInt32
	}
	if value < math.MinInt32 {
		return math.MinInt32
	}
	return int32(value)
}

// convertResponse converts both ordinary and accumulated streaming responses.
// reasoning supplies streamed extension data that the SDK does not accumulate.
func convertResponse(resp *openai.ChatCompletion, reasoning *string) (*model.LLMResponse, error) {
	if resp == nil {
		return nil, ErrEmptyResponse
	}
	if len(resp.Choices) == 0 {
		return nil, ErrNoChoices
	}
	if len(resp.Choices) != 1 {
		return nil, fmt.Errorf("chatcompletions: multiple response choices are unsupported")
	}
	choice := resp.Choices[0]
	parts, err := convertMessage(choice.Message, reasoning)
	if err != nil {
		return nil, err
	}
	if len(parts) == 0 {
		return nil, ErrNoTextOrToolContent
	}
	if len(choice.Message.ToolCalls) > 0 && choice.FinishReason != "tool_calls" && choice.FinishReason != "stop" {
		return nil, fmt.Errorf("chatcompletions: incomplete tool calls (finish reason %q)", choice.FinishReason)
	}
	out := &model.LLMResponse{
		Content:        &genai.Content{Role: string(genai.RoleModel), Parts: parts},
		FinishReason:   finishReason(choice.FinishReason),
		LogprobsResult: convertLogprobs(choice.Logprobs),
		ModelVersion:   resp.Model,
		TurnComplete:   true,
		CustomMetadata: map[string]any{"openai_response_id": resp.ID, "openai_model": resp.Model},
	}
	if resp.JSON.Usage.Valid() {
		// A provider that omits usage has not said the turn cost nothing, which
		// zeros would; streaming leaves it unset in the same case.
		out.UsageMetadata = convertUsage(resp.Usage)
	}
	return out, nil
}

// convertMessage converts an assistant message into genai parts. A refusal
// becomes ordinary answer text.
func convertMessage(msg openai.ChatCompletionMessage, reasoning *string) ([]*genai.Part, error) {
	var parts []*genai.Part
	if reasoning == nil {
		if raw := msg.JSON.ExtraFields["reasoning_content"].Raw(); raw != "" && raw != "null" {
			var text string
			if err := json.Unmarshal([]byte(raw), &text); err != nil {
				return nil, fmt.Errorf("chatcompletions: invalid reasoning_content: %w", err)
			}
			reasoning = &text
		}
	}
	if reasoning != nil {
		parts = append(parts, &genai.Part{Text: *reasoning, Thought: true})
	}
	if msg.Content != "" {
		parts = append(parts, &genai.Part{Text: msg.Content})
	}
	if msg.Refusal != "" {
		parts = append(parts, &genai.Part{Text: msg.Refusal})
	}
	seenIDs := make(map[string]bool)
	for _, call := range msg.ToolCalls {
		if call.Type != "" && call.Type != "function" {
			// Only function tools are ever declared, so nothing can answer it.
			// Fail the turn rather than silently discarding the invocation.
			return nil, fmt.Errorf("%w: tool call %q", ErrUnsupportedOutputItemType, call.Type)
		}
		fn := call.Function
		if fn.Name == "" {
			if call.ID == "" && fn.Arguments == "" {
				// The accumulator pads a tool-call index a stream skipped, and
				// no call was made there.
				continue
			}
			// Stored in the session, a nameless call would fail every later
			// request, so the turn fails here instead.
			return nil, fmt.Errorf("%w (call_id %q)", ErrFunctionCallMissingName, call.ID)
		}
		if call.ID == "" || seenIDs[call.ID] {
			return nil, fmt.Errorf("chatcompletions: missing or duplicate tool call id %q", call.ID)
		}
		seenIDs[call.ID] = true
		args, err := functionCallArgs(fn.Arguments)
		if err != nil {
			// Name the offending call: conversion aborts on the first error, so
			// nothing else identifies it.
			return nil, fmt.Errorf("%w (name %q, call_id %q)", err, fn.Name, call.ID)
		}
		parts = append(parts, &genai.Part{
			FunctionCall: &genai.FunctionCall{Name: fn.Name, ID: call.ID, Args: args},
		})
	}
	return parts, nil
}

// functionCallArgs decodes a tool call's arguments, reading an empty payload as
// a call that takes none.
func functionCallArgs(raw string) (map[string]any, error) {
	if raw == "" {
		return map[string]any{}, nil
	}
	args := map[string]any{}
	if err := json.Unmarshal([]byte(raw), &args); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrFunctionCallArgs, err)
	}
	if args == nil {
		// The payload was JSON null: the call takes no arguments.
		return map[string]any{}, nil
	}
	return args, nil
}

// finishReason maps a Chat Completions finish_reason onto the genai finish
// reason. "tool_calls" is a clean stop, as it is in adk-python's LiteLLM path:
// the model finished its turn by calling a tool.
func finishReason(reason string) genai.FinishReason {
	switch reason {
	case "stop", "tool_calls", "function_call":
		return genai.FinishReasonStop
	case "length":
		return genai.FinishReasonMaxTokens
	case "content_filter":
		return genai.FinishReasonSafety
	case "":
		// A provider that states nothing says nothing about why the turn ended,
		// and reading that silence as a clean stop would have a caller that
		// retries on anything but STOP accept a partial answer as final.
		return genai.FinishReasonUnspecified
	default:
		return genai.FinishReasonOther
	}
}

// convertUsage converts Chat Completions token accounting into genai usage
// metadata, whose field names differ from this endpoint's on every count.
func convertUsage(usage openai.CompletionUsage) *genai.GenerateContentResponseUsageMetadata {
	return &genai.GenerateContentResponseUsageMetadata{
		PromptTokenCount:        safeInt32(usage.PromptTokens),
		CandidatesTokenCount:    safeInt32(usage.CompletionTokens),
		TotalTokenCount:         safeInt32(usage.TotalTokens),
		CachedContentTokenCount: safeInt32(usage.PromptTokensDetails.CachedTokens),
		PromptTokensDetails: []*genai.ModalityTokenCount{
			{Modality: genai.MediaModalityText, TokenCount: safeInt32(usage.PromptTokens)},
		},
		CandidatesTokensDetails: []*genai.ModalityTokenCount{
			{Modality: genai.MediaModalityText, TokenCount: safeInt32(usage.CompletionTokens)},
		},
		ThoughtsTokenCount: safeInt32(usage.CompletionTokensDetails.ReasoningTokens),
	}
}

// convertLogprobs converts a choice's content log probabilities into the
// genai shape. Refusal logprobs are left out, because the tokens they describe
// are not the ones a caller reads back as the answer.
func convertLogprobs(logprobs openai.ChatCompletionChoiceLogprobs) *genai.LogprobsResult {
	if len(logprobs.Content) == 0 {
		return nil
	}
	res := &genai.LogprobsResult{}
	for _, lp := range logprobs.Content {
		res.ChosenCandidates = append(res.ChosenCandidates, &genai.LogprobsResultCandidate{
			Token:          lp.Token,
			LogProbability: float32(lp.Logprob),
		})
		var top []*genai.LogprobsResultCandidate
		for _, tlp := range lp.TopLogprobs {
			top = append(top, &genai.LogprobsResultCandidate{
				Token:          tlp.Token,
				LogProbability: float32(tlp.Logprob),
			})
		}
		res.TopCandidates = append(res.TopCandidates, &genai.LogprobsResultTopCandidates{Candidates: top})
	}
	return res
}
