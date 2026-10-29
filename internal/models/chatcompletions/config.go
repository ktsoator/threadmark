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

// Adapted from google.golang.org/adk/v2 v2.6.0, model/openaimodel/internal/shared/config.go.
// Adapted for Threadmark's Chat Completions adapter.
package chatcompletions

import (
	"fmt"
	"time"

	"google.golang.org/genai"
)

// requestTimeout reports the bound the caller asked for, or zero for none; the
// caller applies it to the context, which bounds retries as openai-go's own
// per-request option would not, and on a streamed turn spans the consumer's
// time in the range body.
//
// Non-positive is treated as unset here rather than trusted to the endpoint
// packages' applyGenerationConfig having rejected it, since openai-go reads zero
// as no deadline at all.
func requestTimeout(cfg *genai.GenerateContentConfig) time.Duration {
	if cfg == nil || cfg.HTTPOptions == nil || cfg.HTTPOptions.Timeout == nil {
		return 0
	}
	if *cfg.HTTPOptions.Timeout <= 0 {
		return 0
	}
	return *cfg.HTTPOptions.Timeout
}

// unsupportedHTTPOptionFields describe Gemini request settings that this adapter cannot translate.
var unsupportedHTTPOptionFields = []struct {
	Name  string
	IsSet func(*genai.HTTPOptions) bool
}{
	// The endpoint belongs to Config, which is also the only place it can
	// be set coherently alongside the API key that authenticates against it.
	{Name: "BaseURL", IsSet: func(o *genai.HTTPOptions) bool { return o.BaseURL != "" }},
	{Name: "BaseURLResourceScope", IsSet: func(o *genai.HTTPOptions) bool { return o.BaseURLResourceScope != "" }},
	{Name: "APIVersion", IsSet: func(o *genai.HTTPOptions) bool { return o.APIVersion != "" }},
	// Both shape a Gemini request body, which is not the body being sent.
	{Name: "ExtraBody", IsSet: func(o *genai.HTTPOptions) bool { return o.ExtraBody != nil }},
	{Name: "ExtrasRequestProvider", IsSet: func(o *genai.HTTPOptions) bool { return o.ExtrasRequestProvider != nil }},
	// openai-go retries too, but on its own schedule; honoring only the retry
	// count would quietly discard the backoff the caller asked for.
	{Name: "RetryOptions", IsSet: func(o *genai.HTTPOptions) bool { return o.RetryOptions != nil }},
}

// rejectUntranslatableValues catches the settings whose field is translated but
// whose particular value would vanish, which the presence check below cannot
// see; a value that instead reaches the wire and draws a named 400, as an
// out-of-range Logprobs does, is already diagnosable and is left to the API.
//
// It runs after every named error so that a caller who set one of those too
// gets the error they have always got, rather than this sentinel jumping the
// queue and breaking their errors.Is.
func rejectUntranslatableValues(cfg *genai.GenerateContentConfig) error {
	switch {
	case cfg.Logprobs != nil && !cfg.ResponseLogprobs:
		// Logprobs only sizes the list ResponseLogprobs asks for, so alone it
		// reaches neither params nor the wire.
		return fmt.Errorf("%w: Logprobs without ResponseLogprobs", ErrUnsupportedConfigField)
	case cfg.MaxOutputTokens < 0:
		// Only a positive cap is translated. A negative one is neither a cap
		// nor the absence of one, so it would otherwise vanish.
		return fmt.Errorf("%w: negative MaxOutputTokens", ErrUnsupportedConfigField)
	case cfg.CandidateCount < 0:
		// Above one is ErrMultipleCandidatesNotSupported; zero and one both mean
		// the single candidate either endpoint asks for. Below zero means nothing.
		return fmt.Errorf("%w: negative CandidateCount", ErrUnsupportedConfigField)
	}
	// HTTPOptions is taken field by field rather than whole. Timeout is
	// extracted by requestTimeout, Headers is deliberately ignored for the
	// compatibility reason in ignoredHTTPOptionFields, and what is left
	// describes the Gemini wire format and is named here.
	if cfg.HTTPOptions != nil {
		for _, field := range unsupportedHTTPOptionFields {
			if field.IsSet(cfg.HTTPOptions) {
				return fmt.Errorf("%w: HTTPOptions.%s", ErrUnsupportedConfigField, field.Name)
			}
		}
		// openai-go treats a zero timeout as "no deadline", so forwarding a
		// non-positive one would lift the caller's bound rather than apply it —
		// the inverse of what they asked for, and worse than not asking.
		if cfg.HTTPOptions.Timeout != nil && *cfg.HTTPOptions.Timeout <= 0 {
			return fmt.Errorf("%w: non-positive HTTPOptions.Timeout %v", ErrUnsupportedConfigField, *cfg.HTTPOptions.Timeout)
		}
	}
	return nil
}

// unsupportedConfigFields lists unsupported GenerateContentConfig settings.
var unsupportedConfigFields = []configField{
	{Name: "RoutingConfig", IsSet: func(c *genai.GenerateContentConfig) bool { return c.RoutingConfig != nil }},
	{Name: "ModelSelectionConfig", IsSet: func(c *genai.GenerateContentConfig) bool { return c.ModelSelectionConfig != nil }},
	{Name: "CachedContent", IsSet: func(c *genai.GenerateContentConfig) bool { return c.CachedContent != "" }},
	{Name: "ResponseModalities", IsSet: func(c *genai.GenerateContentConfig) bool { return c.ResponseModalities != nil }},
	{Name: "MediaResolution", IsSet: func(c *genai.GenerateContentConfig) bool { return c.MediaResolution != "" }},
	{Name: "SpeechConfig", IsSet: func(c *genai.GenerateContentConfig) bool { return c.SpeechConfig != nil }},
	{Name: "AudioTimestamp", IsSet: func(c *genai.GenerateContentConfig) bool { return c.AudioTimestamp }},
	{Name: "ImageConfig", IsSet: func(c *genai.GenerateContentConfig) bool { return c.ImageConfig != nil }},
	{Name: "EnableEnhancedCivicAnswers", IsSet: func(c *genai.GenerateContentConfig) bool {
		return c.EnableEnhancedCivicAnswers != nil
	}},
	{Name: "ModelArmorConfig", IsSet: func(c *genai.GenerateContentConfig) bool { return c.ModelArmorConfig != nil }},
	{Name: "AudioTranscriptionConfig", IsSet: func(c *genai.GenerateContentConfig) bool { return c.AudioTranscriptionConfig != nil }},
	{Name: "ContinuationToken", IsSet: func(c *genai.GenerateContentConfig) bool { return c.ContinuationToken != nil }},
}

// configField names a GenerateContentConfig field alongside a predicate
// reporting whether the caller set it.
type configField struct {
	Name  string
	IsSet func(*genai.GenerateContentConfig) bool
}

// rejectConfigFields reports the first field in the list the caller set.
func rejectConfigFields(fields []configField, cfg *genai.GenerateContentConfig) error {
	for _, field := range fields {
		if field.IsSet(cfg) {
			return fmt.Errorf("%w: %s", ErrUnsupportedConfigField, field.Name)
		}
	}
	return nil
}
