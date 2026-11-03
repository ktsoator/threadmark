package handler

import (
	"context"
	"iter"
	"net/http"
	"slices"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/server/dto"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
)

func (h *Handler) Run(c *gin.Context) {
	run, ok := h.prepareRun(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	events := []dto.Event{}
	for event, err := range run.events(ctx) {
		if err != nil {
			cancel()
			fail(c, http.StatusInternalServerError, "Agent execution failed.")
			return
		}
		if event != nil {
			events = append(events, dto.FromSessionEvent(*event))
		}
	}
	c.JSON(http.StatusOK, events)
}

type preparedRun struct {
	runner  *runner.Runner
	request dto.RunRequest
	config  agent.RunConfig
}

func (h *Handler) prepareRun(c *gin.Context) (*preparedRun, bool) {
	var body dto.RunRequest
	if !decodeJSON(c, &body, false) {
		return nil, false
	}
	if strings.TrimSpace(body.AppName) == "" || strings.TrimSpace(body.UserID) == "" ||
		strings.TrimSpace(body.SessionID) == "" || len(body.NewMessage.Parts) == 0 {
		fail(c, http.StatusBadRequest, "appName, userId, sessionId and newMessage.parts are required.")
		return nil, false
	}
	for _, part := range body.NewMessage.Parts {
		if part == nil {
			fail(c, http.StatusBadRequest, "Message parts must not be null.")
			return nil, false
		}
	}
	r, ok := h.prepareRunner(c, body.AppName, body.UserID, body.SessionID)
	if !ok {
		return nil, false
	}
	mode := agent.StreamingModeNone
	if body.Streaming {
		mode = agent.StreamingModeSSE
	}
	return &preparedRun{runner: r, request: body, config: agent.RunConfig{StreamingMode: mode}}, true
}

func (h *Handler) prepareRunner(c *gin.Context, appName, userID, sessionID string) (*runner.Runner, bool) {
	if !slices.Contains(h.agents.ListAgents(), appName) {
		fail(c, http.StatusNotFound, "Agent application not found.")
		return nil, false
	}
	a, err := h.agents.LoadAgent(appName)
	if err != nil {
		fail(c, http.StatusInternalServerError, "Could not load the agent application.")
		return nil, false
	}
	_, err = h.sessions.Get(c.Request.Context(), &session.GetRequest{
		AppName: appName, UserID: userID, SessionID: sessionID,
	})
	if err != nil {
		sessionError(c, err)
		return nil, false
	}
	r, err := runner.New(runner.Config{
		AppName: appName, Agent: a, SessionService: h.sessions,
	})
	if err != nil {
		fail(c, http.StatusInternalServerError, "Could not initialize the agent runner.")
		return nil, false
	}
	return r, true
}

func (r *preparedRun) events(ctx context.Context) iter.Seq2[*session.Event, error] {
	var options []runner.RunOption
	if r.request.StateDelta != nil {
		options = append(options, runner.WithStateDelta(r.request.StateDelta))
	}
	return r.runner.Run(ctx, r.request.UserID, r.request.SessionID, &r.request.NewMessage, r.config, options...)
}
