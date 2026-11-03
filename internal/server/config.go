package server

import (
	"time"

	"github.com/ktsoator/threadmark/internal/skills"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

// Config supplies shared services and HTTP limits to the Gin server.
type Config struct {
	AgentLoader    agent.Loader
	SessionService session.Service
	SkillService   *skills.Service
	BindHost       string
	AllowedOrigins []string
	MaxPayloadSize int64
	// Zero selects 120 seconds; a negative duration disables the write deadline.
	SSEWriteTimeout time.Duration
}
