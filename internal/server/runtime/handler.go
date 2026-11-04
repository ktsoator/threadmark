package runtime

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	agentruntime "github.com/ktsoator/threadmark/internal/runtime"
	"github.com/ktsoator/threadmark/internal/server/events"
	"github.com/ktsoator/threadmark/internal/server/httpx"
	"github.com/ktsoator/threadmark/session"
)

type Handler struct {
	service    *agentruntime.Service
	sseTimeout time.Duration
}

func New(service *agentruntime.Service, sseTimeout time.Duration) *Handler {
	if sseTimeout == 0 {
		sseTimeout = 120 * time.Second
	}
	return &Handler{service: service, sseTimeout: sseTimeout}
}

func (h *Handler) Run(c *gin.Context) {
	run, ok := h.prepareRun(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	history := []events.Event{}
	for event, err := range run.Events(ctx) {
		if err != nil {
			cancel()
			httpx.Fail(c, http.StatusInternalServerError, "Agent execution failed.")
			return
		}
		if event != nil {
			history = append(history, events.FromSessionEvent(*event))
		}
	}
	c.JSON(http.StatusOK, history)
}

func (h *Handler) prepareRun(c *gin.Context) (*agentruntime.PreparedRun, bool) {
	var body RunRequest
	if !httpx.DecodeJSON(c, &body, false) {
		return nil, false
	}
	run, err := h.service.PrepareRun(c.Request.Context(), &agentruntime.RunRequest{
		Ref:        session.Ref{AppName: body.AppName, UserID: body.UserID, SessionID: body.SessionID},
		NewMessage: body.NewMessage, Streaming: body.Streaming, StateDelta: body.StateDelta,
	})
	if err != nil {
		httpx.Error(c, err)
		return nil, false
	}
	return run, true
}
