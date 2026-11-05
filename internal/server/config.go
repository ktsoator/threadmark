package server

import (
	"context"
	"time"

	"github.com/ktsoator/threadmark/internal/runtime"
	"github.com/ktsoator/threadmark/project"
	"github.com/ktsoator/threadmark/session"
	"github.com/ktsoator/threadmark/skills"
)

// Config supplies shared services and HTTP limits to the Gin server.
type Config struct {
	Projects       project.Service
	Sessions       *session.Service
	Runtime        *runtime.Service
	Models         *runtime.ModelList
	DeleteProject  func(context.Context, *project.DeleteRequest) error
	SkillsFor      func(context.Context, session.DirectoryContext) (*skills.Service, error)
	BindHost       string
	AllowedOrigins []string
	MaxPayloadSize int64
	// Zero selects 120 seconds; a negative duration disables the write deadline.
	SSEWriteTimeout time.Duration
}
