package skills

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"

	"google.golang.org/adk/v2/tool/skilltoolset/skill"
)

// NewAgentSource adds execution hints to the shared source for ADK consumers.
func NewAgentSource(source *Source) skill.Source {
	return &agentSource{Source: source}
}

type agentSource struct {
	*Source
}

// Include the selected skill's location so scripts resolve against the right root.
func (s *agentSource) LoadInstructions(ctx context.Context, name string) (string, error) {
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
