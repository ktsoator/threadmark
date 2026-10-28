package skills

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"google.golang.org/adk/v2/tool/skilltoolset/skill"
)

// NewSource discovers project and user skills in the shared .agents/skills locations.
func NewSource(cwd string) (skill.Source, []string, error) {
	userHome, err := os.UserHomeDir()
	if err != nil {
		return nil, nil, err
	}
	var dirs []string
	var sources []skill.Source
	for _, root := range []string{cwd, userHome} {
		dir := filepath.Join(root, ".agents", "skills")
		info, err := os.Stat(dir)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, nil, fmt.Errorf("inspect skills directory %s: %w", dir, err)
		}
		if !info.IsDir() {
			return nil, nil, fmt.Errorf("skills path is not a directory: %s", dir)
		}
		dirs = append(dirs, dir)
		sources = append(sources, skill.NewFileSystemSource(os.DirFS(dir)))
	}
	return &source{
		Source:  skill.NewMergedSource(sources...),
		dirs:    dirs,
		sources: sources,
	}, dirs, nil
}

type source struct {
	skill.Source
	dirs    []string
	sources []skill.Source
}

// ADK's merged source rejects duplicate names when listing. Keep the first
// occurrence instead, matching its first-source-wins loading behavior.
func (s *source) ListFrontmatters(ctx context.Context) ([]*skill.Frontmatter, error) {
	var available []*skill.Frontmatter
	seen := make(map[string]bool)
	for i, src := range s.sources {
		items, err := src.ListFrontmatters(ctx)
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

// Include the selected skill's location so scripts resolve against the right root.
func (s *source) LoadInstructions(ctx context.Context, name string) (string, error) {
	for i, src := range s.sources {
		body, err := src.LoadInstructions(ctx, name)
		if errors.Is(err, skill.ErrSkillNotFound) {
			continue
		}
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("Skill directory: %s\nResolve relative script paths against this directory.\n\n%s", filepath.Join(s.dirs[i], name), body), nil
	}
	return "", skill.ErrSkillNotFound
}
