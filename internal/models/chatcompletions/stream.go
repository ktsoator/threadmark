package chatcompletions

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/packages/param"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func (m *Model) generateStream(ctx context.Context, params openai.ChatCompletionNewParams, yield func(*model.LLMResponse, error) bool) {
	params.StreamOptions.IncludeUsage = param.NewOpt(true)
	stream := m.client.Chat.Completions.NewStreaming(ctx, params)
	defer stream.Close()

	var acc openai.ChatCompletionAccumulator
	var reasoning strings.Builder
	var hasReasoning bool
	var usage *openai.CompletionUsage
	var id string
	for stream.Next() {
		chunk := stream.Current()
		if id == "" {
			id = chunk.ID
		}
		chunk.ID = id
		if !acc.AddChunk(chunk) {
			yield(nil, fmt.Errorf("chatcompletions: stream chunk could not be accumulated"))
			return
		}
		if chunk.JSON.Usage.Valid() {
			latest := chunk.Usage
			usage = &latest
		}
		var parts []*genai.Part
		for _, choice := range chunk.Choices {
			if choice.Index != 0 {
				yield(nil, fmt.Errorf("chatcompletions: multiple response choices are unsupported"))
				return
			}
			delta := choice.Delta
			for key := range delta.JSON.ExtraFields {
				if key != "reasoning_content" {
					yield(nil, fmt.Errorf("chatcompletions: unsupported streamed assistant field %q", key))
					return
				}
			}
			if raw := delta.JSON.ExtraFields["reasoning_content"].Raw(); raw != "" && raw != "null" {
				var text string
				if err := json.Unmarshal([]byte(raw), &text); err != nil {
					yield(nil, fmt.Errorf("chatcompletions: invalid reasoning_content: %w", err))
					return
				}
				hasReasoning = true
				reasoning.WriteString(text)
				if text != "" {
					parts = append(parts, &genai.Part{Text: text, Thought: true})
				}
			}
			if delta.Content != "" {
				parts = append(parts, &genai.Part{Text: delta.Content})
			}
			if delta.Refusal != "" {
				parts = append(parts, &genai.Part{Text: delta.Refusal})
			}
		}
		if len(parts) > 0 && !yield(&model.LLMResponse{
			Content: &genai.Content{Role: "model", Parts: parts}, Partial: true,
		}, nil) {
			return
		}
	}
	if err := stream.Err(); err != nil {
		yield(nil, fmt.Errorf("chatcompletions: stream failed: %w", err))
		return
	}
	if err := ctx.Err(); err != nil {
		yield(nil, err)
		return
	}
	completion := &acc.ChatCompletion
	if len(completion.Choices) != 1 || completion.Choices[0].FinishReason == "" {
		yield(nil, fmt.Errorf("chatcompletions: stream ended without a finish reason"))
		return
	}
	// The SDK accumulates ordinary text and calls, but not extension fields.
	// Combine them for the final ADK response.
	var reasoningText *string
	if hasReasoning {
		text := reasoning.String()
		reasoningText = &text
	}
	response, err := convertResponse(completion, reasoningText)
	if err == nil {
		response.UsageMetadata = nil
		if usage != nil {
			response.UsageMetadata = convertUsage(*usage)
		}
	}
	yield(response, err)
}
