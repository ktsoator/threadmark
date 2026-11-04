package server

import (
	"context"
	"time"

	"github.com/ktsoator/threadmark/internal/projects"
	"github.com/ktsoator/threadmark/internal/runtime"
	"github.com/ktsoator/threadmark/internal/sessions"
)

// Config supplies shared services and HTTP limits to the Gin server.
type Config struct {
	Projects       projects.Service
	Sessions       *sessions.Service
	Runtime        *runtime.Service
	DeleteProject  func(context.Context, *projects.DeleteRequest) error
	BindHost       string
	AllowedOrigins []string
	MaxPayloadSize int64
	// Zero selects 120 seconds; a negative duration disables the write deadline.
	SSEWriteTimeout time.Duration
}
