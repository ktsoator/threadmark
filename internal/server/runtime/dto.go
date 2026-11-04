package runtime

import "google.golang.org/genai"

type RunRequest struct {
	AppName    string         `json:"appName"`
	UserID     string         `json:"userId"`
	SessionID  string         `json:"sessionId"`
	NewMessage genai.Content  `json:"newMessage"`
	Streaming  bool           `json:"streaming,omitempty"`
	StateDelta map[string]any `json:"stateDelta,omitempty"`
	// Accepted by ADK's REST protocol, but currently not used by its runner.
	FunctionCallEventID *string `json:"functionCallEventId,omitempty"`
}
