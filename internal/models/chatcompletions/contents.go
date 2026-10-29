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

// Adapted from google.golang.org/adk/v2 v2.6.0, model/openaimodel/internal/shared/contents.go.
// Adapted for Threadmark's Chat Completions adapter.
package chatcompletions

import (
	"fmt"
	"reflect"
	"strings"

	"google.golang.org/genai"
)

// flattenContentText joins a content's text parts with newlines, and errors on
// a part without text.
func flattenContentText(content *genai.Content) (string, error) {
	if content == nil {
		return "", nil
	}
	var b strings.Builder
	for _, part := range content.Parts {
		if part == nil {
			continue
		}
		if part.Text == "" {
			return "", fmt.Errorf("non-text system instruction part %T", part)
		}
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString(part.Text)
	}
	return b.String(), nil
}

// unsupportedPayload names the first field this text/function adapter cannot send.
//
// The test is stated as the absence of anything unaccounted for rather than as
// a list of the fields that disqualify a part, so that a field added to
// genai.Part by a later release is reported here by default instead of leaving
// the request unnoticed.
func unsupportedPayload(part *genai.Part) string {
	if part == nil {
		return ""
	}
	rest := *part
	rest.Text = ""              // sent as answer text or reasoning_content
	rest.Thought = false        // the marker deciding which
	rest.FunctionCall = nil     // sent as a call
	rest.FunctionResponse = nil // sent as the call's result
	rest.VideoMetadata = nil    // qualifies media carried in another field
	rest.MediaResolution = nil  // likewise
	rest.PartMetadata = nil     // caller bookkeeping, never content

	v := reflect.ValueOf(rest)
	for i := range v.NumField() {
		if !v.Field(i).IsZero() {
			return v.Type().Field(i).Name
		}
	}
	return ""
}
