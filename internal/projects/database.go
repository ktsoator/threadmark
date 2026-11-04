package projects

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type databaseService struct {
	db          *gorm.DB
	managedRoot string
	mu          sync.Mutex
}

// NewDatabaseService initializes the projects table on a shared connection.
// managedRoot is reserved for independently managed conversation directories.
// The caller owns the connection and closes it after both services stop.
func NewDatabaseService(db *gorm.DB, managedRoot string) (Service, error) {
	if db == nil {
		return nil, fmt.Errorf("project database is required")
	}
	root, err := NormalizeDirectory(managedRoot)
	if err != nil {
		return nil, fmt.Errorf("managed directories root: %w", err)
	}
	if err := db.AutoMigrate(&Project{}); err != nil {
		return nil, err
	}
	return &databaseService{db: db, managedRoot: root}, nil
}

func (s *databaseService) List(ctx context.Context, req *ListRequest) (*ListResponse, error) {
	items := []Project{}
	if err := s.db.WithContext(ctx).Where("app_name = ? AND user_id = ?", req.AppName, req.UserID).Order("created_at ASC, id ASC").Find(&items).Error; err != nil {
		return nil, err
	}
	return &ListResponse{Projects: items}, nil
}

func (s *databaseService) Get(ctx context.Context, req *GetRequest) (*GetResponse, error) {
	var p Project
	err := s.db.WithContext(ctx).Where("app_name = ? AND user_id = ? AND id = ?", req.AppName, req.UserID, req.ProjectID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &GetResponse{Project: &p}, nil
}

func (s *databaseService) Create(ctx context.Context, req *CreateRequest) (*CreateResponse, error) {
	directory, err := NormalizeDirectory(req.Directory)
	if err != nil {
		return nil, err
	}
	if containsPath(s.managedRoot, directory) || containsPath(directory, s.managedRoot) {
		return nil, ErrReservedDirectory
	}
	name := req.Name
	if strings.TrimSpace(name) == "" {
		name = filepath.Base(directory)
	}
	name, err = projectName(name)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	result, err := s.List(ctx, &ListRequest{AppName: req.AppName, UserID: req.UserID})
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(directory)
	if err != nil {
		return nil, ErrDirectoryUnavailable
	}
	for _, item := range result.Projects {
		other, statErr := os.Stat(item.Directory)
		if item.Directory == directory || (statErr == nil && os.SameFile(info, other)) {
			return nil, &ExistsError{ProjectID: item.ID}
		}
	}
	p := &Project{ID: uuid.NewString(), AppName: req.AppName, UserID: req.UserID, Name: name, Directory: directory}
	if err := s.db.WithContext(ctx).Create(p).Error; err != nil {
		return nil, err
	}
	return &CreateResponse{Project: p}, nil
}

func (s *databaseService) Rename(ctx context.Context, req *RenameRequest) (*RenameResponse, error) {
	name, err := projectName(req.Name)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	result, err := s.Get(ctx, &GetRequest{AppName: req.AppName, UserID: req.UserID, ProjectID: req.ProjectID})
	if err != nil {
		return nil, err
	}
	p := result.Project
	p.Name = name
	if err := s.db.WithContext(ctx).Save(p).Error; err != nil {
		return nil, err
	}
	return &RenameResponse{Project: p}, nil
}

func (s *databaseService) Delete(ctx context.Context, req *DeleteRequest) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	result, err := s.Get(ctx, &GetRequest{AppName: req.AppName, UserID: req.UserID, ProjectID: req.ProjectID})
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).Delete(result.Project).Error
}
