package skills

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"

	"google.golang.org/adk/v2/tool/skilltoolset/skill"
)

// Skill names follow the Agent Skills format and identify one directory.
var namePattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Service provides skill metadata and instructions independently of HTTP.
type Service struct {
	source skill.Source
}

func NewService(source skill.Source) *Service {
	return &Service{source: source}
}

func (s *Service) List(ctx context.Context) ([]Summary, error) {
	items, err := s.source.ListFrontmatters(ctx)
	if err != nil {
		return nil, fmt.Errorf("list skills: %w", err)
	}
	summaries := make([]Summary, 0, len(items))
	for _, item := range items {
		summaries = append(summaries, Summary{Name: item.Name, Description: item.Description})
	}
	slices.SortFunc(summaries, func(a, b Summary) int { return cmp.Compare(a.Name, b.Name) })
	return summaries, nil
}

func (s *Service) Get(ctx context.Context, name string) (*Detail, error) {
	if len(name) > 64 || !namePattern.MatchString(name) {
		return nil, fmt.Errorf("%w: %q", ErrInvalidName, name)
	}
	metadata, err := s.source.LoadFrontmatter(ctx, name)
	if err != nil {
		return nil, readError(name, err)
	}
	instructions, err := s.source.LoadInstructions(ctx, name)
	if err != nil {
		return nil, readError(name, err)
	}
	return &Detail{
		Name:         metadata.Name,
		Description:  metadata.Description,
		Instructions: instructions,
	}, nil
}

func readError(name string, err error) error {
	if errors.Is(err, skill.ErrSkillNotFound) {
		return fmt.Errorf("%w: %s", ErrNotFound, name)
	}
	return fmt.Errorf("read skill %s: %w", name, err)
}
