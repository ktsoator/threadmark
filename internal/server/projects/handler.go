package projects

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/projects"
	"github.com/ktsoator/threadmark/internal/server/httpx"
)

type Handler struct {
	service       projects.Service
	deleteProject func(context.Context, *projects.DeleteRequest) error
}

func New(service projects.Service, deleteProject func(context.Context, *projects.DeleteRequest) error) *Handler {
	return &Handler{service: service, deleteProject: deleteProject}
}

func (h *Handler) List(c *gin.Context) {
	result, err := h.service.List(c.Request.Context(), &projects.ListRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id")})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	c.JSON(http.StatusOK, result.Projects)
}

func (h *Handler) Create(c *gin.Context) {
	var body CreateRequest
	if !httpx.DecodeJSON(c, &body, false) {
		return
	}
	result, err := h.service.Create(c.Request.Context(), &projects.CreateRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id"), Name: body.Name, Directory: body.Directory})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	c.JSON(http.StatusCreated, result.Project)
}

func (h *Handler) Rename(c *gin.Context) {
	var body RenameRequest
	if !httpx.DecodeJSON(c, &body, false) {
		return
	}
	result, err := h.service.Rename(c.Request.Context(), &projects.RenameRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id"), ProjectID: c.Param("project_id"), Name: body.Name})
	if err != nil {
		httpx.Error(c, err)
		return
	}
	c.JSON(http.StatusOK, result.Project)
}

func (h *Handler) Delete(c *gin.Context) {
	if err := h.deleteProject(c.Request.Context(), &projects.DeleteRequest{AppName: c.Param("app_name"), UserID: c.Param("user_id"), ProjectID: c.Param("project_id")}); err != nil {
		httpx.Error(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
