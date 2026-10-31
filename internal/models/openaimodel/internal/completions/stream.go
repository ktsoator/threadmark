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

package completions

import (
	"errors"

	"github.com/openai/openai-go/v3"
	"google.golang.org/genai"
)

// errToolCallChunkRejected reports a streamed tool-call delta the accumulator
// could not hold, which would otherwise leave the turn's call missing or
// incomplete.
var errToolCallChunkRejected = errors.New("openai: streamed tool call chunk could not be accumulated")

// streamTranslator turns Chat Completions chunks into genai responses while
// accumulating the whole turn.
//
// Tool calls are not emitted as they stream. The protocol has no event marking
// one complete — arguments arrive as fragments and the only signal they have
// stopped is the stream ending — so they reach the caller on the final response,
// built from the accumulated snapshot by the same converter the blocking path
// uses.
type streamTranslator struct {
	acc            openai.ChatCompletionAccumulator
	reasoningField string
	// id is the first non-empty chunk id of the stream.
	id string
	// usage is the latest usage a chunk reported, or nil if none did. It is
	// kept apart from the accumulator, which sums every report: right only for
	// a provider sending usage once, while several resend the running total on
	// every chunk. The latest report is the turn's total either way, which is
	// also how adk-python's LiteLLM path reads it.
	usage *openai.CompletionUsage
}

// newStreamTranslator returns a translator for one streamed turn.
func newStreamTranslator(reasoningField string) *streamTranslator {
	return &streamTranslator{reasoningField: reasoningField}
}

// process folds one chunk into the accumulated turn and reports the partial it
// contributes, or nil for a chunk a caller sees nothing of.
func (t *streamTranslator) process(chunk openai.ChatCompletionChunk) (*genai.GenerateContentResponse, error) {
	// One stream is one completion, so a provider varying the id per chunk
	// must not have the accumulator refuse every chunk after the first; its
	// guard against mixing completions has nothing to guard on one stream.
	if t.id == "" {
		t.id = chunk.ID
	}
	if t.id != "" {
		chunk.ID = t.id
	}
	// A chunk still refused, for a choice index beyond the accumulator's bound
	// or a tool-call index growing it too far, leaves the snapshot untouched.
	// Its text is still yielded below, but a call exists only in the snapshot.
	if !t.acc.AddChunk(chunk) && carriesToolCall(chunk) {
		return nil, errToolCallChunkRejected
	}
	if chunk.JSON.Usage.Valid() {
		usage := chunk.Usage
		t.usage = &usage
	}

	if len(chunk.Choices) == 0 {
		// The usage-only chunk that closes a stream requesting usage.
		return nil, nil
	}
	delta := chunk.Choices[0].Delta
	reasoning, err := readReasoningText(delta.JSON.ExtraFields, t.reasoningField)
	if err != nil {
		return nil, err
	}
	var parts []*genai.Part
	if reasoning != "" {
		parts = append(parts, &genai.Part{Text: reasoning, Thought: true})
	}
	if delta.Content != "" {
		parts = append(parts, &genai.Part{Text: delta.Content})
	}
	if delta.Refusal != "" {
		// Blocking reports a refusal as text, so streaming does the same.
		parts = append(parts, &genai.Part{Text: delta.Refusal})
	}
	if len(parts) == 0 {
		return nil, nil
	}
	// A delta may contain both reasoning and answer text. Leave the finish
	// reason unset so the aggregator treats this response as a partial.
	return &genai.GenerateContentResponse{
		Candidates: []*genai.Candidate{{
			Content: &genai.Content{Role: string(genai.RoleModel), Parts: parts},
		}},
	}, nil
}

// carriesToolCall reports whether any choice in chunk carries a tool-call delta.
func carriesToolCall(chunk openai.ChatCompletionChunk) bool {
	for _, choice := range chunk.Choices {
		if len(choice.Delta.ToolCalls) > 0 {
			return true
		}
	}
	return false
}

// completion is the whole turn as the blocking path would have received it.
func (t *streamTranslator) completion() *openai.ChatCompletion {
	return &t.acc.ChatCompletion
}
