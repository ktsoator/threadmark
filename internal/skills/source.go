package skills

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"google.golang.org/adk/v2/tool/skilltoolset/skill"
)

// NewSource uses the project and user .agents/skills locations.
func NewSource(cwd string) (*Source, []string, error) {
	userHome, err := os.UserHomeDir()
	if err != nil {
		return nil, nil, err
	}

	var dirs []string
	var sources []skill.Source
	seen := make(map[string]bool)
	for _, root := range []string{cwd, userHome} {
		if root == "" {
			continue
		}
		dir := filepath.Join(root, ".agents", "skills")
		if seen[dir] {
			continue
		}
		seen[dir] = true

		info, err := os.Stat(dir)
		if err != nil && !errors.Is(err, os.ErrNotExist) {
			return nil, nil, fmt.Errorf("inspect skills directory %s: %w", dir, err)
		}
		if err == nil && !info.IsDir() {
			return nil, nil, fmt.Errorf("skills path is not a directory: %s", dir)
		}

		// Keep missing roots so skills added after startup are discoverable.
		dirs = append(dirs, dir)
		sources = append(sources, skill.NewFileSystemSource(os.DirFS(dir)))
	}

	return &Source{
		Source:  skill.NewMergedSource(sources...),
		dirs:    dirs,
		sources: sources,
	}, dirs, nil
}

// Source merges project and user skills while preserving their original content.
type Source struct {
	skill.Source
	dirs    []string
	sources []skill.Source
}

// ADK's merged source rejects duplicate names when listing. Keep the first
// occurrence instead, matching its first-source-wins loading behavior.
func (s *Source) ListFrontmatters(ctx context.Context) ([]*skill.Frontmatter, error) {
	var available []*skill.Frontmatter
	seen := make(map[string]bool)
	for i, src := range s.sources {
		items, err := src.ListFrontmatters(ctx)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, fmt.Errorf("list skills in %s: %w", s.dirs[i], err)
		}
		for _, item := range items {
			if seen[item.Name] {
				continue
			}
			seen[item.Name] = true
			available = append(available, item)
		}
	}
	return available, nil
}
