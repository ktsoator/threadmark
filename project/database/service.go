package database

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/ktsoator/threadmark/project"
	"gorm.io/gorm"
)

// Config supplies a shared database and directories that cannot be registered as projects.
type Config struct {
	DB *gorm.DB
	// ReservedDirectories includes managed directory roots and excludes their ancestors and descendants.
	ReservedDirectories []string
}

type databaseService struct {
	db                  *gorm.DB
	reservedDirectories []string
	mu                  sync.Mutex
}

type storedProject struct {
	ID        string `gorm:"primaryKey"`
	AppName   string `gorm:"uniqueIndex:project_directory"`
	UserID    string `gorm:"uniqueIndex:project_directory"`
	Name      string
	Directory string `gorm:"uniqueIndex:project_directory"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (storedProject) TableName() string { return "projects" }

func (p *storedProject) project() *project.Project {
	value := project.Project(*p)
	return &value
}

// NewService initializes the projects table on a caller-owned connection.
// The returned service serializes writes and canonical directory duplicate checks.
func NewService(cfg Config) (project.Service, error) {
	if cfg.DB == nil {
		return nil, fmt.Errorf("project database is required")
	}
	reserved := make([]string, 0, len(cfg.ReservedDirectories))
	for _, path := range cfg.ReservedDirectories {
		real, err := project.NormalizeDirectory(path)
		if err != nil {
			return nil, fmt.Errorf("reserved directory: %w", err)
		}
		reserved = append(reserved, real)
	}
	if err := cfg.DB.AutoMigrate(&storedProject{}); err != nil {
		return nil, err
	}
	return &databaseService{db: cfg.DB, reservedDirectories: reserved}, nil
}

func (s *databaseService) List(ctx context.Context, req *project.ListRequest) (*project.ListResponse, error) {
	if req == nil || req.AppName == "" || req.UserID == "" {
		return nil, project.ErrInvalidRequest
	}
	rows := []storedProject{}
	if err := s.db.WithContext(ctx).Where("app_name = ? AND user_id = ?", req.AppName, req.UserID).Order("created_at ASC, id ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]project.Project, 0, len(rows))
	for _, row := range rows {
		items = append(items, project.Project(row))
	}
	return &project.ListResponse{Projects: items}, nil
}

func (s *databaseService) Get(ctx context.Context, req *project.GetRequest) (*project.GetResponse, error) {
	if req == nil || req.AppName == "" || req.UserID == "" || req.ProjectID == "" {
		return nil, project.ErrInvalidRequest
	}
	var p storedProject
	err := s.db.WithContext(ctx).Where("app_name = ? AND user_id = ? AND id = ?", req.AppName, req.UserID, req.ProjectID).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, project.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &project.GetResponse{Project: p.project()}, nil
}

func (s *databaseService) Create(ctx context.Context, req *project.CreateRequest) (*project.CreateResponse, error) {
	if req == nil || req.AppName == "" || req.UserID == "" {
		return nil, project.ErrInvalidRequest
	}
	directory, err := project.NormalizeDirectory(req.Directory)
	if err != nil {
		return nil, err
	}
	for _, root := range s.reservedDirectories {
		if containsPath(root, directory) || containsPath(directory, root) {
			return nil, project.ErrReservedDirectory
		}
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
	result, err := s.List(ctx, &project.ListRequest{AppName: req.AppName, UserID: req.UserID})
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(directory)
	if err != nil {
		return nil, project.ErrDirectoryUnavailable
	}
	for _, item := range result.Projects {
		other, statErr := os.Stat(item.Directory)
		if item.Directory == directory || (statErr == nil && os.SameFile(info, other)) {
			return nil, &project.ExistsError{ProjectID: item.ID}
		}
	}
	p := &storedProject{ID: uuid.NewString(), AppName: req.AppName, UserID: req.UserID, Name: name, Directory: directory}
	if err := s.db.WithContext(ctx).Create(p).Error; err != nil {
		return nil, err
	}
	return &project.CreateResponse{Project: p.project()}, nil
}

func (s *databaseService) Rename(ctx context.Context, req *project.RenameRequest) (*project.RenameResponse, error) {
	if req == nil || req.AppName == "" || req.UserID == "" || req.ProjectID == "" {
		return nil, project.ErrInvalidRequest
	}
	name, err := projectName(req.Name)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	result, err := s.Get(ctx, &project.GetRequest{AppName: req.AppName, UserID: req.UserID, ProjectID: req.ProjectID})
	if err != nil {
		return nil, err
	}
	p := storedProject(*result.Project)
	p.Name = name
	if err := s.db.WithContext(ctx).Save(&p).Error; err != nil {
		return nil, err
	}
	return &project.RenameResponse{Project: p.project()}, nil
}

func (s *databaseService) Delete(ctx context.Context, req *project.DeleteRequest) error {
	if req == nil || req.AppName == "" || req.UserID == "" || req.ProjectID == "" {
		return project.ErrInvalidRequest
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	result, err := s.Get(ctx, &project.GetRequest{AppName: req.AppName, UserID: req.UserID, ProjectID: req.ProjectID})
	if err != nil {
		return err
	}
	p := storedProject(*result.Project)
	return s.db.WithContext(ctx).Delete(&p).Error
}

func projectName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > 120 {
		return "", project.ErrInvalidName
	}
	return name, nil
}

func containsPath(parent, path string) bool {
	rel, err := filepath.Rel(parent, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}
