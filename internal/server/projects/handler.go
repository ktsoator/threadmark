package projects

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/server/httpx"
	"github.com/ktsoator/threadmark/project"
)

type Handler struct {
	service       project.Service
	deleteProject func(context.Context, *project.DeleteRequest) error
}

func New(service project.Service, deleteProject func(context.Context, *project.DeleteRequest) error) *Handler {
	return &Handler{service: service, deleteProject: deleteProject}
}

func (h *Handler) List(c *gin.Context) {
	result, err := h.service.List(c.Request.Context(), &project.ListRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id")})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	items := make([]Project, 0, len(result.Projects))
	for _, item := range result.Projects {
		items = append(items, fromProject(item))
	}
	c.JSON(http.StatusOK, items)
}

func (h *Handler) Create(c *gin.Context) {
	var body CreateRequest
	if !httpx.DecodeJSON(c, &body, false) {
		return
	}
	result, err := h.service.Create(c.Request.Context(), &project.CreateRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id"), Name: body.Name, Directory: body.Directory})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, fromProject(*result.Project))
}

func (h *Handler) Rename(c *gin.Context) {
	var body RenameRequest
	if !httpx.DecodeJSON(c, &body, false) {
		return
	}
	result, err := h.service.Rename(c.Request.Context(), &project.RenameRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id"), ProjectID: c.Param("project_id"), Name: body.Name})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	c.JSON(http.StatusOK, fromProject(*result.Project))
}

func (h *Handler) Delete(c *gin.Context) {
	if err := h.deleteProject(c.Request.Context(), &project.DeleteRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id"), ProjectID: c.Param("project_id")}); err != nil {
		httpx.Error(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
