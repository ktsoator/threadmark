package runtime

import (
	"context"
	"errors"
	"fmt"
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

// Service prepares agent runs using the conversation service's directory and busy gate.
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

// PreparedRun holds the busy lease from preparation until Release, including event consumption.
type PreparedRun struct {
	runner  *runner.Runner
	request RunRequest
	release func()
}

func (r *PreparedRun) Release() { r.release() }

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

func (s *Service) PrepareRun(ctx context.Context, req *RunRequest) (_ *PreparedRun, retErr error) {
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
	release, err := s.sessions.Acquire(ref)
	if err != nil {
		return nil, err
	}
	defer func() {
		if retErr != nil {
			release()
		}
	}()
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
		Description: "A general-purpose assistant that can read, edit, and write files and run Bash commands.",
		Instruction: fmt.Sprintf(`You are a friendly and accurate general-purpose assistant. Respond concisely in English by default, unless the user requests another language. Clearly state when you are uncertain.

Working directory: %s
Relative file paths and Bash commands use this directory. Absolute paths are also supported.
Use read to inspect text files before editing.
Use edit for targeted changes and write for new files or complete rewrites.
Use bash to list and search files and to run programs or tests. Each call starts a fresh shell.
Check tool errors and command exit codes, and use the results to decide what to do next.
Report changes and verification accurately. Do not claim an operation succeeded unless its tool result confirms it.`, path),
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
	return &PreparedRun{runner: r, request: request, release: release}, nil
}
