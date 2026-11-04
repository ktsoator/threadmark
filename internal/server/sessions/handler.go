package sessions

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/server/events"
	"github.com/ktsoator/threadmark/internal/server/httpx"
	conversations "github.com/ktsoator/threadmark/session"
	"google.golang.org/adk/v2/session"
)

type Handler struct {
	service *conversations.Service
}

func New(service *conversations.Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) List(c *gin.Context) {
	items, err := h.service.List(c.Request.Context(), &session.ListRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id")})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	result := make([]Session, 0, len(items.Sessions))
	for _, item := range items.Sessions {
		result = append(result, FromSession(item, h.service.ManagedDirectory(item)))
	}
	c.JSON(http.StatusOK, result)
}

func (h *Handler) Create(c *gin.Context) {
	var body CreateRequest
	if !httpx.DecodeJSON(c, &body, true) {
		return
	}
	initialEvents := make([]*session.Event, 0, len(body.Events))
	for _, event := range body.Events {
		initialEvents = append(initialEvents, events.ToSessionEvent(event))
	}
	stored, err := h.service.Create(c.Request.Context(), &conversations.CreateRequest{
		CreateRequest: session.CreateRequest{
			AppName: c.Param("app_name"), UserID: c.Param("user_id"), SessionID: c.Param("session_id"), State: body.State,
		},
		ProjectID: body.ProjectID, Events: initialEvents,
	})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	c.JSON(http.StatusOK, FromSession(stored.Session, h.service.ManagedDirectory(stored.Session)))
}

func (h *Handler) Get(c *gin.Context) {
	stored, err := h.service.Get(c.Request.Context(), &session.GetRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id"), SessionID: c.Param("session_id")})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	c.JSON(http.StatusOK, FromSession(stored.Session, h.service.ManagedDirectory(stored.Session)))
}

// AppendMessage records a user message without starting an agent invocation.
func (h *Handler) AppendMessage(c *gin.Context) {
	var body AppendMessageRequest
	if !httpx.DecodeJSON(c, &body, false) {
		return
	}
	stored, err := h.service.AppendMessage(c.Request.Context(), &conversations.AppendMessageRequest{Ref: sessionRef(c), Text: body.Text})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	c.JSON(http.StatusOK, FromSession(stored, h.service.ManagedDirectory(stored)))
}

func (h *Handler) Update(c *gin.Context) {
	var body UpdateRequest
	if !httpx.DecodeJSON(c, &body, true) {
		return
	}
	stored, err := h.service.Update(c.Request.Context(), &conversations.UpdateRequest{Ref: sessionRef(c), StateDelta: body.StateDelta})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	c.JSON(http.StatusOK, FromSession(stored, h.service.ManagedDirectory(stored)))
}

func (h *Handler) Delete(c *gin.Context) {
	option := c.Query("deleteWorkspace")
	if option != "" && option != "true" && option != "false" {
		httpx.Fail(c, http.StatusBadRequest, "deleteWorkspace must be true or false.")
		return
	}
	result, err := h.service.Delete(c.Request.Context(), &conversations.DeleteRequest{
		DeleteRequest:   session.DeleteRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id"), SessionID: c.Param("session_id")},
		DeleteDirectory: option == "true",
	})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	response := DeleteResponse{Deleted: true, WorkspaceCleanup: string(result.Cleanup), RetainedPath: result.Directory}
	if result.CleanupError != nil {
		log.Printf("Delete conversation directory: %v", result.CleanupError)
		response.Warning = fmt.Sprintf("Conversation deleted. The workspace could not be removed. Files may remain at %s", result.Directory)
	}
	c.JSON(http.StatusOK, response)
}

func sessionRef(c *gin.Context) conversations.Ref {
	return conversations.Ref{AppName: c.Param("app_name"), UserID: c.Param("user_id"), SessionID: c.Param("session_id")}
}
