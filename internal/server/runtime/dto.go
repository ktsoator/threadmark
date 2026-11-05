package runtime

import (
	agentruntime "github.com/ktsoator/threadmark/internal/runtime"
	"google.golang.org/genai"
)

type TitleRequest struct {
	Text  string                       `json:"text"`
	Model *agentruntime.ModelSelection `json:"model,omitempty"`
}

type TitleResponse struct {
	Title string `json:"title"`
}

type RunRequest struct {
	AppName    string                       `json:"appName"`
	UserID     string                       `json:"userId"`
	SessionID  string                       `json:"sessionId"`
	NewMessage genai.Content                `json:"newMessage"`
	Streaming  bool                         `json:"streaming,omitempty"`
	StateDelta map[string]any               `json:"stateDelta,omitempty"`
	Model      *agentruntime.ModelSelection `json:"model,omitempty"`
	// Accepted by ADK's REST protocol, but currently not used by its runner.
	FunctionCallEventID *string `json:"functionCallEventId,omitempty"`
}
