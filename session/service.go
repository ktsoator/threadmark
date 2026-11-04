// Package session provides Threadmark conversation operations backed by ADK sessions.
package session

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

// Service coordinates project bindings, directories, and conversation writes over ADK storage.
type Service struct {
	db          *gorm.DB
	store       adksession.Service
	projects    project.Service
	rootPath    string
	projectLock sync.Locker
}

// NewService initializes the metadata table on the supplied connection and does not close it.
// The managed root must already exist. Default locations and directory creation belong to the caller.
func NewService(cfg Config) (*Service, error) {
	if cfg.DB == nil || cfg.Store == nil || cfg.Projects == nil {
		return nil, fmt.Errorf("database, ADK session store and project service are required")
	}
	root, err := project.NormalizeDirectory(cfg.ManagedRoot)
	if err != nil {
		return nil, fmt.Errorf("managed directory root: %w", err)
	}
	if err := cfg.DB.AutoMigrate(&storedMetadata{}); err != nil {
		return nil, err
	}
	lock := cfg.ProjectLock
	if lock == nil {
		lock = &sync.Mutex{}
	}
	return &Service{db: cfg.DB, store: cfg.Store, projects: cfg.Projects, rootPath: root, projectLock: lock}, nil
}

func validRef(ref Ref) bool {
	return ref.AppName != "" && ref.UserID != "" && ref.SessionID != ""
}

func (s *Service) List(ctx context.Context, req *adksession.ListRequest) (*adksession.ListResponse, error) {
	if req == nil || req.AppName == "" || req.UserID == "" {
		return nil, ErrInvalidRequest
	}
	return s.store.List(ctx, req)
}

func (s *Service) Get(ctx context.Context, req *adksession.GetRequest) (*adksession.GetResponse, error) {
	if req == nil || req.AppName == "" || req.UserID == "" || req.SessionID == "" {
		return nil, ErrInvalidRequest
	}
	return s.store.Get(ctx, req)
}

func (s *Service) get(ctx context.Context, ref Ref) (adksession.Session, error) {
	result, err := s.Get(ctx, &adksession.GetRequest{AppName: ref.AppName, UserID: ref.UserID, SessionID: ref.SessionID})
	if err != nil {
		return nil, err
	}
	return result.Session, nil
}

func (s *Service) Create(ctx context.Context, req *CreateRequest) (*adksession.CreateResponse, error) {
	if req == nil || req.AppName == "" || req.UserID == "" {
		return nil, ErrInvalidRequest
	}
	opts := *req
	if err := ValidateState(opts.State); err != nil {
		return nil, err
	}
	for _, event := range opts.Events {
		if event == nil {
			return nil, ErrInvalidEvent
		}
		if err := ValidateState(event.Actions.StateDelta); err != nil {
			return nil, err
		}
	}
	if opts.SessionID == "" {
		opts.SessionID = platform.NewUUID(ctx)
	}
	ref := Ref{AppName: opts.AppName, UserID: opts.UserID, SessionID: opts.SessionID}
	if opts.ProjectID != "" {
		// Keep the project alive until the new session has been committed.
		s.projectLock.Lock()
		defer s.projectLock.Unlock()
		if _, err := s.projects.Get(ctx, &project.GetRequest{AppName: opts.AppName, UserID: opts.UserID, ProjectID: opts.ProjectID}); err != nil {
			return nil, err
		}
	}
	if _, err := s.get(ctx, ref); err == nil {
		return nil, ErrExists
	} else if !errors.Is(err, adksession.ErrNotFound) {
		return nil, err
	}
	opts.State = maps.Clone(opts.State)
	if opts.State == nil {
		opts.State = map[string]any{}
	}
	var managedID string
	if opts.ProjectID != "" {
		opts.State[ProjectIDKey] = opts.ProjectID
	} else {
		id, err := s.allocateManaged(ref)
		if err != nil {
			return nil, err
		}
		managedID = id
		opts.State[ManagedIDKey] = managedID
	}
	var stored adksession.Session
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		svc, err := adkdatabase.NewSessionServiceFromDB(tx)
		if err != nil {
			return err
		}
		result, err := svc.Create(ctx, &opts.CreateRequest)
		if err != nil {
			return err
		}
		stored = result.Session
		if err := tx.Create(&storedMetadata{AppName: ref.AppName, UserID: ref.UserID, SessionID: ref.SessionID, Metadata: Metadata{TitleSource: TitleNone}}).Error; err != nil {
			return err
		}
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
		if cleanupErr := s.removeManaged(ref, managedID, true); cleanupErr != nil {
			err = errors.Join(err, fmt.Errorf("rollback conversation directory: %w", cleanupErr))
		}
	}
	if err != nil {
		return nil, err
	}
	return &adksession.CreateResponse{Session: stored}, nil
}

func (s *Service) AppendMessage(ctx context.Context, req *AppendMessageRequest) (adksession.Session, error) {
	if req == nil || !validRef(req.Ref) {
		return nil, ErrInvalidRequest
	}
	ref, text := req.Ref, req.Text
	if strings.TrimSpace(text) == "" {
		return nil, ErrInvalidMessage
	}
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
	return stored, nil
}

func (s *Service) Update(ctx context.Context, req *UpdateRequest) (adksession.Session, error) {
	if req == nil || !validRef(req.Ref) {
		return nil, ErrInvalidRequest
	}
	ref, delta := req.Ref, req.StateDelta
	if err := ValidateState(delta); err != nil {
		return nil, err
	}
	var title string
	titleSource := req.TitleSource
	if titleSource != "" && (req.Title == nil || (titleSource != TitleManual && titleSource != TitleGenerated)) {
		return nil, ErrInvalidTitleSource
	}
	if titleSource == "" {
		titleSource = TitleManual
	}
	if req.Title != nil {
		var err error
		title, err = validTitle(*req.Title)
		if err != nil {
			return nil, err
		}
	}
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
		return nil, ErrStateScope
	}
	if len(delta) > 0 || req.Title != nil {
		err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
			if len(delta) > 0 {
				svc, err := adkdatabase.NewSessionServiceFromDB(tx)
				if err != nil {
					return err
				}
				event := adksession.NewEvent(ctx, platform.NewUUID(ctx))
				event.Author = "user"
				event.Actions.StateDelta = delta
				if err := svc.AppendEvent(ctx, stored, event); err != nil {
					return err
				}
			}
			if req.Title != nil {
				query := tx.Model(&storedMetadata{}).
					Where("app_name = ? AND user_id = ? AND session_id = ?", ref.AppName, ref.UserID, ref.SessionID)
				if titleSource == TitleGenerated {
					query = query.Where("title_source = ?", TitleNone)
				}
				result := query.Updates(map[string]any{"title": title, "title_source": titleSource})
				if result.Error != nil {
					return result.Error
				}
				if result.RowsAffected == 0 && titleSource == TitleManual {
					return adksession.ErrNotFound
				}
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	return s.get(ctx, ref)
}

func (s *Service) Delete(ctx context.Context, req *DeleteRequest) (*DeleteResponse, error) {
	if req == nil || req.AppName == "" || req.UserID == "" || req.SessionID == "" {
		return nil, ErrInvalidRequest
	}
	ref := Ref{AppName: req.AppName, UserID: req.UserID, SessionID: req.SessionID}
	cleanup := req.DeleteDirectory
	stored, err := s.get(ctx, ref)
	if errors.Is(err, adksession.ErrNotFound) {
		return &DeleteResponse{Cleanup: CleanupNotAttempted}, nil
	}
	if err != nil {
		return nil, err
	}
	directory := s.ManagedDirectory(stored)
	if cleanup && directory == "" {
		return nil, ErrInvalidCleanup
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		svc, err := adkdatabase.NewSessionServiceFromDB(tx)
		if err != nil {
			return err
		}
		if err := svc.Delete(ctx, &req.DeleteRequest); err != nil {
			return err
		}
		return tx.Where("app_name = ? AND user_id = ? AND session_id = ?", ref.AppName, ref.UserID, ref.SessionID).Delete(&storedMetadata{}).Error
	})
	if err != nil {
		return nil, err
	}
	out := &DeleteResponse{Cleanup: CleanupNotApplicable}
	if directory == "" {
		return out, nil
	}
	out.Cleanup, out.Directory = CleanupRetained, directory
	if !cleanup {
		return out, nil
	}
	if err := s.removeManaged(ref, ManagedIDOf(stored), false); err != nil {
		out.Cleanup = CleanupFailed
		out.CleanupError = err
		return out, nil
	}
	out.Cleanup, out.Directory = CleanupDeleted, ""
	return out, nil
}
