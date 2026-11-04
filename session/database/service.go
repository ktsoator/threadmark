// Package database implements conversation operations using ADK's database session service.
package database

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"strings"
	"sync"

	"github.com/ktsoator/threadmark/project"
	"github.com/ktsoator/threadmark/session"
	"google.golang.org/adk/v2/platform"
	adksession "google.golang.org/adk/v2/session"
	adkdatabase "google.golang.org/adk/v2/session/database"
	"google.golang.org/genai"
	"gorm.io/gorm"
)

// Config supplies caller-owned storage, project lookup, and an existing managed directory root.
type Config struct {
	DB *gorm.DB
	// Store must be an ADK database session service using DB, with its schema initialized.
	Store       adksession.Service
	Projects    project.Service
	ManagedRoot string
	// ProjectLock coordinates project session creation with project deletion.
	// A nil value uses a private lock, suitable when projects are not deleted concurrently.
	ProjectLock sync.Locker
}

type service struct {
	db          *gorm.DB
	store       adksession.Service
	projects    project.Service
	rootPath    string
	projectLock sync.Locker
	busyMu      sync.Mutex
	busy        map[session.Ref]bool
}

// NewService shares the supplied connection and does not close it.
// The managed root must already exist. Default locations and directory creation belong to the caller.
func NewService(cfg Config) (session.Service, error) {
	if cfg.DB == nil || cfg.Store == nil || cfg.Projects == nil {
		return nil, fmt.Errorf("database, ADK session store and project service are required")
	}
	root, err := project.NormalizeDirectory(cfg.ManagedRoot)
	if err != nil {
		return nil, fmt.Errorf("managed directory root: %w", err)
	}
	lock := cfg.ProjectLock
	if lock == nil {
		lock = &sync.Mutex{}
	}
	return &service{db: cfg.DB, store: cfg.Store, projects: cfg.Projects, rootPath: root, projectLock: lock, busy: make(map[session.Ref]bool)}, nil
}

func validRef(ref session.Ref) bool {
	return ref.AppName != "" && ref.UserID != "" && ref.SessionID != ""
}

// Acquire holds the conversation busy until the returned release function is called.
// Runtime uses the same gate as conversation writes and deletion.
func (s *service) Acquire(ref session.Ref) (func(), error) {
	if !validRef(ref) {
		return nil, session.ErrInvalidRequest
	}
	s.busyMu.Lock()
	defer s.busyMu.Unlock()
	if s.busy[ref] {
		return nil, session.ErrBusy
	}
	s.busy[ref] = true
	var once sync.Once
	return func() { once.Do(func() { s.busyMu.Lock(); delete(s.busy, ref); s.busyMu.Unlock() }) }, nil
}

func (s *service) List(ctx context.Context, req *session.ListRequest) (*session.ListResponse, error) {
	if req == nil || req.AppName == "" || req.UserID == "" {
		return nil, session.ErrInvalidRequest
	}
	return s.store.List(ctx, req)
}

func (s *service) Get(ctx context.Context, req *session.GetRequest) (*session.GetResponse, error) {
	if req == nil || !validRef(req.Ref) {
		return nil, session.ErrInvalidRequest
	}
	return s.store.Get(ctx, &adksession.GetRequest{AppName: req.AppName, UserID: req.UserID, SessionID: req.SessionID, NumRecentEvents: req.NumRecentEvents, After: req.After})
}

func (s *service) get(ctx context.Context, ref session.Ref) (adksession.Session, error) {
	result, err := s.Get(ctx, &session.GetRequest{Ref: ref})
	if err != nil {
		return nil, err
	}
	return result.Session, nil
}

func (s *service) Create(ctx context.Context, req *session.CreateRequest) (*session.CreateResponse, error) {
	if req == nil || req.AppName == "" || req.UserID == "" {
		return nil, session.ErrInvalidRequest
	}
	opts := *req
	if err := session.ValidateState(opts.State); err != nil {
		return nil, err
	}
	for _, event := range opts.Events {
		if event == nil {
			return nil, session.ErrInvalidEvent
		}
		if err := session.ValidateState(event.Actions.StateDelta); err != nil {
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
		s.projectLock.Lock()
		defer s.projectLock.Unlock()
		if _, err := s.projects.Get(ctx, &project.GetRequest{AppName: opts.AppName, UserID: opts.UserID, ProjectID: opts.ProjectID}); err != nil {
			return nil, err
		}
	}
	if _, err := s.get(ctx, opts.Ref); err == nil {
		return nil, session.ErrExists
	} else if !errors.Is(err, adksession.ErrNotFound) {
		return nil, err
	}
	state := maps.Clone(opts.State)
	if state == nil {
		state = map[string]any{}
	}
	var managedID string
	if opts.ProjectID != "" {
		state[session.ProjectIDKey] = opts.ProjectID
	} else {
		managedID, err = s.allocateManaged(opts.Ref)
		if err != nil {
			return nil, err
		}
		state[session.ManagedIDKey] = managedID
	}
	var stored adksession.Session
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		svc, err := adkdatabase.NewSessionServiceFromDB(tx)
		if err != nil {
			return err
		}
		result, err := svc.Create(ctx, &adksession.CreateRequest{AppName: opts.AppName, UserID: opts.UserID, SessionID: opts.SessionID, State: state})
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
			err = errors.Join(err, fmt.Errorf("rollback conversation directory: %w", cleanupErr))
		}
	}
	if err != nil {
		return nil, err
	}
	return &session.CreateResponse{Session: stored}, nil
}

func (s *service) AppendMessage(ctx context.Context, req *session.AppendMessageRequest) (*session.AppendMessageResponse, error) {
	if req == nil || !validRef(req.Ref) {
		return nil, session.ErrInvalidRequest
	}
	ref, text := req.Ref, req.Text
	if strings.TrimSpace(text) == "" {
		return nil, session.ErrInvalidMessage
	}
	release, err := s.Acquire(ref)
	if err != nil {
		return nil, err
	}
	defer release()
	stored, err := s.get(ctx, ref)
	if err != nil {
		return nil, err
	}
	event := adksession.NewEvent(ctx, platform.NewUUID(ctx))
	event.Author = "user"
	event.Content = genai.NewContentFromText(text, genai.RoleUser)
	if err := s.store.AppendEvent(ctx, stored, event); err != nil {
		return nil, err
	}
	return &session.AppendMessageResponse{Session: stored}, nil
}

func (s *service) Update(ctx context.Context, req *session.UpdateRequest) (*session.UpdateResponse, error) {
	if req == nil || !validRef(req.Ref) {
		return nil, session.ErrInvalidRequest
	}
	ref, delta := req.Ref, req.StateDelta
	if err := session.ValidateState(delta); err != nil {
		return nil, err
	}
	release, err := s.Acquire(ref)
	if err != nil {
		return nil, err
	}
	defer release()
	stored, err := s.get(ctx, ref)
	if err != nil {
		return nil, err
	}
	delta = maps.Clone(delta)
	for key, value := range delta {
		if !strings.HasPrefix(key, adksession.KeyPrefixApp) && !strings.HasPrefix(key, adksession.KeyPrefixUser) && !strings.HasPrefix(key, adksession.KeyPrefixTemp) {
			continue
		}
		current, err := stored.State().Get(key)
		left, lerr := json.Marshal(current)
		right, rerr := json.Marshal(value)
		if err == nil && lerr == nil && rerr == nil && bytes.Equal(left, right) {
			delete(delta, key)
			continue
		}
		return nil, session.ErrStateScope
	}
	if len(delta) > 0 {
		event := adksession.NewEvent(ctx, platform.NewUUID(ctx))
		event.Author = "user"
		event.Actions.StateDelta = delta
		if err := s.store.AppendEvent(ctx, stored, event); err != nil {
			return nil, err
		}
	}
	updated, err := s.get(ctx, ref)
	if err != nil {
		return nil, err
	}
	return &session.UpdateResponse{Session: updated}, nil
}

func (s *service) Delete(ctx context.Context, req *session.DeleteRequest) (*session.DeleteResponse, error) {
	if req == nil || !validRef(req.Ref) {
		return nil, session.ErrInvalidRequest
	}
	ref, cleanup := req.Ref, req.DeleteDirectory
	release, err := s.Acquire(ref)
	if err != nil {
		return nil, err
	}
	defer release()
	stored, err := s.get(ctx, ref)
	if errors.Is(err, adksession.ErrNotFound) {
		return &session.DeleteResponse{Cleanup: session.CleanupNotAttempted}, nil
	}
	if err != nil {
		return nil, err
	}
	directory := s.ManagedDirectory(stored)
	if cleanup && directory == "" {
		return nil, session.ErrInvalidCleanup
	}
	if err := s.store.Delete(ctx, &adksession.DeleteRequest{AppName: ref.AppName, UserID: ref.UserID, SessionID: ref.SessionID}); err != nil {
		return nil, err
	}
	out := &session.DeleteResponse{Cleanup: session.CleanupNotApplicable}
	if directory == "" {
		return out, nil
	}
	out.Cleanup, out.Directory = session.CleanupRetained, directory
	if !cleanup {
		return out, nil
	}
	if err := s.removeManaged(ref, session.ManagedIDOf(stored), false); err != nil {
		out.Cleanup = session.CleanupFailed
		out.CleanupError = err
		return out, nil
	}
	out.Cleanup, out.Directory = session.CleanupDeleted, ""
	return out, nil
}
