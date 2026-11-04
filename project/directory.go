package project

import (
	"os"
	"path/filepath"
)

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
