package runtime

import (
	"context"
	"errors"
	"fmt"

	"github.com/ktsoator/threadmark/internal/sessions"
	"github.com/ktsoator/threadmark/internal/skills"
	"github.com/ktsoator/threadmark/internal/tools"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/skilltoolset"
)

var ErrAppNotFound = errors.New("Agent application not found.")

// Service prepares agent runs using the conversation service's directory and busy gate.
type Service struct {
	model    model.LLM
	store    session.Service
	sessions *sessions.Service
}

func NewService(llm model.LLM, store session.Service, conversations *sessions.Service) *Service {
	return &Service{model: llm, store: store, sessions: conversations}
}

type PreparedRun struct {
	Runner  *runner.Runner
	Release func()
}

func (s *Service) PrepareRun(ctx context.Context, ref sessions.Ref) (_ *PreparedRun, retErr error) {
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
	return &PreparedRun{Runner: r, Release: release}, nil
}
