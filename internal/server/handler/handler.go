package handler

import (
	"fmt"
	"time"

	"github.com/ktsoator/threadmark/internal/skills"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

type Config struct {
	AgentLoader     agent.Loader
	SessionService  session.Service
	SkillService    *skills.Service
	SSEWriteTimeout time.Duration
}

type Handler struct {
	agents     agent.Loader
	sessions   session.Service
	skills     *skills.Service
	sseTimeout time.Duration
}

func New(cfg Config) (*Handler, error) {
	if cfg.AgentLoader == nil {
		return nil, fmt.Errorf("agent loader is required")
	}
	if cfg.SessionService == nil {
		return nil, fmt.Errorf("session service is required")
	}
	if cfg.SkillService == nil {
		return nil, fmt.Errorf("skill service is required")
	}
	if cfg.SSEWriteTimeout == 0 {
		cfg.SSEWriteTimeout = 120 * time.Second
	}
	return &Handler{
		agents: cfg.AgentLoader, sessions: cfg.SessionService,
		skills: cfg.SkillService, sseTimeout: cfg.SSEWriteTimeout,
	}, nil
}
