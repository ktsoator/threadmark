package projects

import (
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

type Project struct {
	ID        string    `json:"id" gorm:"primaryKey"`
	AppName   string    `json:"-" gorm:"uniqueIndex:project_directory"`
	UserID    string    `json:"-" gorm:"uniqueIndex:project_directory"`
	Name      string    `json:"name"`
	Directory string    `json:"directory" gorm:"uniqueIndex:project_directory"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func projectName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > 120 {
		return "", ErrInvalidName
	}
	return name, nil
}

// NormalizeDirectory resolves an existing absolute folder to its canonical path.
func NormalizeDirectory(path string) (string, error) {
	if !filepath.IsAbs(path) {
		return "", ErrInvalidDirectory
	}
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", ErrDirectoryUnavailable
	}
	info, err := os.Stat(real)
	if err != nil || !info.IsDir() {
		return "", ErrInvalidDirectory
	}
	return filepath.Clean(real), nil
}

func containsPath(parent, path string) bool {
	rel, err := filepath.Rel(parent, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}
