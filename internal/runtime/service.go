package runtime

import (
	"context"
	"errors"
	"iter"
	"maps"
	"strings"

	sessions "github.com/ktsoator/threadmark/session"
	"github.com/ktsoator/threadmark/skills"
	"github.com/ktsoator/threadmark/tools"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/skilltoolset"
	"google.golang.org/genai"
)

var (
	ErrAppNotFound    = errors.New("Agent application not found.")
	ErrInvalidRequest = errors.New("appName, userId, sessionId and newMessage.parts are required.")
	ErrInvalidParts   = errors.New("Message parts must not be null.")
)

// Service prepares agent runs using the conversation service's directory.
type Service struct {
	model    model.LLM
	store    session.Service
	sessions *sessions.Service
}

func NewService(llm model.LLM, store session.Service, conversations *sessions.Service) *Service {
	return &Service{model: llm, store: store, sessions: conversations}
}

type RunRequest struct {
	Ref        sessions.Ref
	NewMessage genai.Content
	Streaming  bool
	StateDelta map[string]any
}

// PreparedRun holds the configured runner and validated request.
type PreparedRun struct {
	runner  *runner.Runner
	request RunRequest
}

func (r *PreparedRun) Events(ctx context.Context) iter.Seq2[*session.Event, error] {
	mode := agent.StreamingModeNone
	if r.request.Streaming {
		mode = agent.StreamingModeSSE
	}
	var options []runner.RunOption
	if r.request.StateDelta != nil {
		options = append(options, runner.WithStateDelta(r.request.StateDelta))
	}
	return r.runner.Run(ctx, r.request.Ref.UserID, r.request.Ref.SessionID, &r.request.NewMessage, agent.RunConfig{StreamingMode: mode}, options...)
}

func (s *Service) PrepareRun(ctx context.Context, req *RunRequest) (*PreparedRun, error) {
	if req == nil || strings.TrimSpace(req.Ref.AppName) == "" || strings.TrimSpace(req.Ref.UserID) == "" || strings.TrimSpace(req.Ref.SessionID) == "" || len(req.NewMessage.Parts) == 0 {
		return nil, ErrInvalidRequest
	}
	for _, part := range req.NewMessage.Parts {
		if part == nil {
			return nil, ErrInvalidParts
		}
	}
	if err := sessions.ValidateState(req.StateDelta); err != nil {
		return nil, err
	}
	ref := req.Ref
	if ref.AppName != "assistant" {
		return nil, ErrAppNotFound
	}
	path, err := s.sessions.DirectoryFor(ctx, sessions.DirectoryContext{AppName: ref.AppName, UserID: ref.UserID, SessionID: ref.SessionID})
	if err != nil {
		return nil, err
	}
	localTools, err := tools.New(path)
	if err != nil {
		return nil, err
	}
	source, _, err := skills.NewSource(path)
	if err != nil {
		return nil, err
	}
	skillTools, err := skilltoolset.New(ctx, skilltoolset.Config{Source: skills.NewAgentSource(source)})
	if err != nil {
		return nil, err
	}
	assistant, err := llmagent.New(llmagent.Config{
		Name: "assistant", Model: s.model,
		Description: "An assistant for understanding projects, working with files, and running commands.",
		// Keep directory names literal, including braces that ADK templates would expand.
		InstructionProvider: func(agent.ReadonlyContext) (string, error) {
			return systemPrompt(path), nil
		},
		Tools: localTools, Toolsets: []tool.Toolset{skillTools},
		OnToolErrorCallbacks: []llmagent.OnToolErrorCallback{tools.RecoverError},
	})
	if err != nil {
		return nil, err
	}
	r, err := runner.New(runner.Config{AppName: ref.AppName, Agent: assistant, SessionService: s.store})
	if err != nil {
		return nil, err
	}
	request := *req
	request.StateDelta = maps.Clone(req.StateDelta)
	return &PreparedRun{runner: r, request: request}, nil
}
