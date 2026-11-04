package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/server/dto"
	"google.golang.org/adk/v2/platform"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

func (h *Handler) ListSessions(c *gin.Context) {
	result, err := h.sessions.List(c.Request.Context(), &session.ListRequest{
		AppName: c.Param("app_name"), UserID: c.Param("user_id"),
	})
	if err != nil {
		sessionError(c, err)
		return
	}
	items := make([]dto.Session, 0, len(result.Sessions))
	for _, stored := range result.Sessions {
		items = append(items, dto.FromSession(stored))
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) CreateSession(c *gin.Context) {
	var body dto.CreateSessionRequest
	if !decodeJSON(c, &body, true) {
		return
	}
	ctx := c.Request.Context()
	result, err := h.sessions.Create(ctx, &session.CreateRequest{
		AppName: c.Param("app_name"), UserID: c.Param("user_id"),
		SessionID: c.Param("session_id"), State: body.State,
	})
	if err != nil {
		sessionError(c, err)
		return
	}
	for _, event := range body.Events {
		if err := h.sessions.AppendEvent(ctx, result.Session, dto.ToSessionEvent(event)); err != nil {
			sessionError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, dto.FromSession(result.Session))
}

func (h *Handler) GetSession(c *gin.Context) {
	stored, err := h.sessions.Get(c.Request.Context(), sessionRequest(c))
	if err != nil {
		sessionError(c, err)
		return
	}
	c.JSON(http.StatusOK, dto.FromSession(stored.Session))
}

// AppendMessage records a user message without starting an agent invocation.
func (h *Handler) AppendMessage(c *gin.Context) {
	var body dto.AppendMessageRequest
	if !decodeJSON(c, &body, false) {
		return
	}
	if strings.TrimSpace(body.Text) == "" {
		fail(c, http.StatusBadRequest, "Message text is required.")
		return
	}
	ctx := c.Request.Context()
	stored, err := h.sessions.Get(ctx, sessionRequest(c))
	if err != nil {
		sessionError(c, err)
		return
	}
	event := session.NewEvent(ctx, platform.NewUUID(ctx))
	event.Author = "user"
	event.Content = genai.NewContentFromText(body.Text, genai.RoleUser)
	if err := h.sessions.AppendEvent(ctx, stored.Session, event); err != nil {
		sessionError(c, err)
		return
	}
	c.JSON(http.StatusOK, dto.FromSession(stored.Session))
}

func (h *Handler) UpdateSession(c *gin.Context) {
	var body dto.UpdateSessionRequest
	if !decodeJSON(c, &body, true) {
		return
	}
	ctx := c.Request.Context()
	req := sessionRequest(c)
	stored, err := h.sessions.Get(ctx, req)
	if err != nil {
		sessionError(c, err)
		return
	}
	// A GET merges app/user state into the session. Permit unchanged echoed
	// values, but prevent this endpoint from writing outside its session.
	for key, value := range body.StateDelta {
		if !scopedStateKey(key) {
			continue
		}
		current, err := stored.Session.State().Get(key)
		if err == nil && equalJSON(current, value) {
			delete(body.StateDelta, key)
			continue
		}
		fail(c, http.StatusBadRequest, "State updates may only change session-scoped keys.")
		return
	}
	if len(body.StateDelta) > 0 {
		event := session.NewEvent(ctx, platform.NewUUID(ctx))
		event.Author = "user"
		event.Actions.StateDelta = body.StateDelta
		if err := h.sessions.AppendEvent(ctx, stored.Session, event); err != nil {
			sessionError(c, err)
			return
		}
		stored, err = h.sessions.Get(ctx, req)
		if err != nil {
			sessionError(c, err)
			return
		}
	}
	c.JSON(http.StatusOK, dto.FromSession(stored.Session))
}

func (h *Handler) DeleteSession(c *gin.Context) {
	err := h.sessions.Delete(c.Request.Context(), &session.DeleteRequest{
		AppName: c.Param("app_name"), UserID: c.Param("user_id"), SessionID: c.Param("session_id"),
	})
	if err != nil {
		sessionError(c, err)
		return
	}
	c.Status(http.StatusOK)
}

func sessionRequest(c *gin.Context) *session.GetRequest {
	return &session.GetRequest{
		AppName: c.Param("app_name"), UserID: c.Param("user_id"), SessionID: c.Param("session_id"),
	}
}

func scopedStateKey(key string) bool {
	return strings.HasPrefix(key, session.KeyPrefixApp) ||
		strings.HasPrefix(key, session.KeyPrefixUser) || strings.HasPrefix(key, session.KeyPrefixTemp)
}

func equalJSON(a, b any) bool {
	left, err := json.Marshal(a)
	if err != nil {
		return false
	}
	right, err := json.Marshal(b)
	return err == nil && bytes.Equal(left, right)
}
