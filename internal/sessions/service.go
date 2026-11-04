package sessions

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"maps"
	"strings"
	"sync"

	"github.com/ktsoator/threadmark/internal/projects"
	"google.golang.org/adk/v2/platform"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/session/database"
	"google.golang.org/genai"
	"gorm.io/gorm"
)

// Service owns conversation rules and directories, using ADK for persistence.
type Service struct {
	db                *gorm.DB
	store             session.Service
	projects          projects.Service
	dataDir           string
	projectSessionsMu *sync.Mutex
	busyMu            sync.Mutex
	busy              map[Ref]bool
}

type Config struct {
	DB       *gorm.DB
	Store    session.Service
	Projects projects.Service
	DataDir  string
	// ProjectSessionsMu is shared with project deletion in the application.
	ProjectSessionsMu *sync.Mutex
}

func NewService(cfg Config) *Service {
	return &Service{
		db: cfg.DB, store: cfg.Store, projects: cfg.Projects,
		dataDir: cfg.DataDir, projectSessionsMu: cfg.ProjectSessionsMu,
		busy: make(map[Ref]bool),
	}
}

type Ref struct {
	AppName   string `json:"appName"`
	UserID    string `json:"userId"`
	SessionID string `json:"sessionId"`
}

const projectIDKey = "threadmark:projectId"
const managedIDKey = "threadmark:managedId"

func stateString(stored session.Session, key string) string {
	value, _ := stored.State().Get(key)
	text, _ := value.(string)
	return text
}

func ProjectIDOf(stored session.Session) string {
	return stateString(stored, projectIDKey)
}

func ValidateClientState(state map[string]any) error {
	for key := range state {
		if strings.HasPrefix(key, "threadmark:") {
			return ErrReservedState
		}
	}
	if _, err := json.Marshal(state); err != nil {
		return ErrInvalidState
	}
	return nil
}

type CreateOptions struct {
	Ref
	ProjectID string
	State     map[string]any
	Events    []*session.Event
}

type DeleteResult struct {
	Deleted          bool   `json:"deleted"`
	WorkspaceCleanup string `json:"workspaceCleanup"`
	RetainedPath     string `json:"retainedPath,omitempty"`
	Warning          string `json:"warning,omitempty"`
}

// Acquire holds the conversation busy until the returned release function is called.
// Runtime uses the same gate as conversation writes and deletion.
func (s *Service) Acquire(ref Ref) (func(), error) {
	s.busyMu.Lock()
	defer s.busyMu.Unlock()
	if s.busy[ref] {
		return nil, ErrBusy
	}
	s.busy[ref] = true
	var once sync.Once
	return func() { once.Do(func() { s.busyMu.Lock(); delete(s.busy, ref); s.busyMu.Unlock() }) }, nil
}

func (s *Service) List(ctx context.Context, appName, userID string) ([]session.Session, error) {
	result, err := s.store.List(ctx, &session.ListRequest{AppName: appName, UserID: userID})
	if err != nil {
		return nil, err
	}
	return result.Sessions, nil
}

func (s *Service) Get(ctx context.Context, ref Ref) (session.Session, error) {
	result, err := s.store.Get(ctx, &session.GetRequest{AppName: ref.AppName, UserID: ref.UserID, SessionID: ref.SessionID})
	if err != nil {
		return nil, err
	}
	return result.Session, nil
}

func (s *Service) Create(ctx context.Context, opts CreateOptions) (session.Session, error) {
	if err := ValidateClientState(opts.State); err != nil {
		return nil, err
	}
	for _, event := range opts.Events {
		if event == nil {
			return nil, ErrInvalidEvent
		}
		if err := ValidateClientState(event.Actions.StateDelta); err != nil {
			return nil, err
		}
	}
	if opts.SessionID == "" {
		opts.SessionID = platform.NewUUID(ctx)
	}
	release, err := s.Acquire(opts.Ref)
	if err != nil {
		return nil, err
	}
	defer release()
	if opts.ProjectID != "" {
		// Keep the project alive until the new session has been committed.
		s.projectSessionsMu.Lock()
		defer s.projectSessionsMu.Unlock()
		if _, err := s.projects.Get(ctx, &projects.GetRequest{AppName: opts.AppName, UserID: opts.UserID, ProjectID: opts.ProjectID}); err != nil {
			return nil, err
		}
	}
	if _, err := s.Get(ctx, opts.Ref); err == nil {
		return nil, ErrExists
	} else if !errors.Is(err, session.ErrNotFound) {
		return nil, err
	}
	state := maps.Clone(opts.State)
	if state == nil {
		state = map[string]any{}
	}
	var managedID string
	if opts.ProjectID != "" {
		state[projectIDKey] = opts.ProjectID
	} else {
		managedID, err = s.allocateManaged(opts.Ref)
		if err != nil {
			return nil, err
		}
		state[managedIDKey] = managedID
	}
	var stored session.Session
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		svc, err := database.NewSessionServiceFromDB(tx)
		if err != nil {
			return err
		}
		result, err := svc.Create(ctx, &session.CreateRequest{AppName: opts.AppName, UserID: opts.UserID, SessionID: opts.SessionID, State: state})
		if err != nil {
			return err
		}
		stored = result.Session
		for _, event := range opts.Events {
			if event.Timestamp.IsZero() {
				event.Timestamp = platform.Now(ctx)
			}
			if err := svc.AppendEvent(ctx, stored, event); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil && managedID != "" {
		if cleanupErr := s.removeManaged(opts.Ref, managedID, true); cleanupErr != nil {
			log.Printf("Create conversation rollback: %v", cleanupErr)
		}
	}
	return stored, err
}

func (s *Service) AppendMessage(ctx context.Context, ref Ref, text string) (session.Session, error) {
	if strings.TrimSpace(text) == "" {
		return nil, ErrInvalidMessage
	}
	release, err := s.Acquire(ref)
	if err != nil {
		return nil, err
	}
	defer release()
	stored, err := s.Get(ctx, ref)
	if err != nil {
		return nil, err
	}
	event := session.NewEvent(ctx, platform.NewUUID(ctx))
	event.Author = "user"
	event.Content = genai.NewContentFromText(text, genai.RoleUser)
	if err := s.store.AppendEvent(ctx, stored, event); err != nil {
		return nil, err
	}
	return stored, nil
}

func (s *Service) Update(ctx context.Context, ref Ref, delta map[string]any) (session.Session, error) {
	if err := ValidateClientState(delta); err != nil {
		return nil, err
	}
	release, err := s.Acquire(ref)
	if err != nil {
		return nil, err
	}
	defer release()
	stored, err := s.Get(ctx, ref)
	if err != nil {
		return nil, err
	}
	delta = maps.Clone(delta)
	for key, value := range delta {
		if !strings.HasPrefix(key, session.KeyPrefixApp) && !strings.HasPrefix(key, session.KeyPrefixUser) && !strings.HasPrefix(key, session.KeyPrefixTemp) {
			continue
		}
		current, err := stored.State().Get(key)
		left, lerr := json.Marshal(current)
		right, rerr := json.Marshal(value)
		if err == nil && lerr == nil && rerr == nil && bytes.Equal(left, right) {
			delete(delta, key)
			continue
		}
		return nil, ErrStateScope
	}
	if len(delta) > 0 {
		event := session.NewEvent(ctx, platform.NewUUID(ctx))
		event.Author = "user"
		event.Actions.StateDelta = delta
		if err := s.store.AppendEvent(ctx, stored, event); err != nil {
			return nil, err
		}
	}
	return s.Get(ctx, ref)
}

func (s *Service) Delete(ctx context.Context, ref Ref, cleanup bool) (*DeleteResult, error) {
	release, err := s.Acquire(ref)
	if err != nil {
		return nil, err
	}
	defer release()
	stored, err := s.Get(ctx, ref)
	if errors.Is(err, session.ErrNotFound) {
		return &DeleteResult{Deleted: true, WorkspaceCleanup: "notAttempted"}, nil
	}
	if err != nil {
		return nil, err
	}
	directory := s.ManagedDirectory(stored)
	if cleanup && directory == "" {
		return nil, ErrInvalidCleanup
	}
	if err := s.store.Delete(ctx, &session.DeleteRequest{AppName: ref.AppName, UserID: ref.UserID, SessionID: ref.SessionID}); err != nil {
		return nil, err
	}
	out := &DeleteResult{Deleted: true, WorkspaceCleanup: "notApplicable"}
	if directory == "" {
		return out, nil
	}
	out.WorkspaceCleanup, out.RetainedPath = "retained", directory
	if !cleanup {
		return out, nil
	}
	if err := s.removeManaged(ref, stateString(stored, managedIDKey), false); err != nil {
		log.Printf("Delete conversation folder %s: %v", directory, err)
		out.WorkspaceCleanup = "failed"
		out.Warning = fmt.Sprintf("Conversation deleted. The workspace could not be removed. Files may remain at %s", directory)
		return out, nil
	}
	out.WorkspaceCleanup, out.RetainedPath = "deleted", ""
	return out, nil
}
