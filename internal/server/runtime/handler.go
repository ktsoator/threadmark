package runtime

import (
	"context"
	"iter"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	agentruntime "github.com/ktsoator/threadmark/internal/runtime"
	"github.com/ktsoator/threadmark/internal/server/events"
	"github.com/ktsoator/threadmark/internal/server/httpx"
	"github.com/ktsoator/threadmark/internal/sessions"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
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
	defer run.Release()
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	history := []events.Event{}
	for event, err := range run.events(ctx) {
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

type preparedRun struct {
	*agentruntime.PreparedRun
	request RunRequest
	config  agent.RunConfig
}

func (h *Handler) prepareRun(c *gin.Context) (*preparedRun, bool) {
	var body RunRequest
	if !httpx.DecodeJSON(c, &body, false) {
		return nil, false
	}
	if strings.TrimSpace(body.AppName) == "" || strings.TrimSpace(body.UserID) == "" ||
		strings.TrimSpace(body.SessionID) == "" || len(body.NewMessage.Parts) == 0 {
		httpx.Fail(c, http.StatusBadRequest, "appName, userId, sessionId and newMessage.parts are required.")
		return nil, false
	}
	for _, part := range body.NewMessage.Parts {
		if part == nil {
			httpx.Fail(c, http.StatusBadRequest, "Message parts must not be null.")
			return nil, false
		}
	}
	if err := sessions.ValidateClientState(body.StateDelta); err != nil {
		httpx.Error(c, err)
		return nil, false
	}
	r, err := h.service.PrepareRun(c.Request.Context(), sessions.Ref{AppName: body.AppName, UserID: body.UserID, SessionID: body.SessionID})
	if err != nil {
		httpx.Error(c, err)
		return nil, false
	}
	mode := agent.StreamingModeNone
	if body.Streaming {
		mode = agent.StreamingModeSSE
	}
	return &preparedRun{PreparedRun: r, request: body, config: agent.RunConfig{StreamingMode: mode}}, true
}

func (r *preparedRun) events(ctx context.Context) iter.Seq2[*session.Event, error] {
	var options []runner.RunOption
	if r.request.StateDelta != nil {
		options = append(options, runner.WithStateDelta(r.request.StateDelta))
	}
	return r.Runner.Run(ctx, r.request.UserID, r.request.SessionID, &r.request.NewMessage, r.config, options...)
}
