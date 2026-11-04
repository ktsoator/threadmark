package skills

import (
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/server/httpx"
	"github.com/ktsoator/threadmark/internal/sessions"
	"github.com/ktsoator/threadmark/internal/skills"
)

type Handler struct {
	directories skills.DirectoryResolver
}

func New(directories skills.DirectoryResolver) *Handler {
	return &Handler{directories: directories}
}

func (h *Handler) List(c *gin.Context) {
	c.Header("Cache-Control", "no-store")

	service, err := h.skillService(c)
	if err != nil {
		httpx.Error(c, err)
		return
	}
	items, err := service.List(c.Request.Context())
	if err != nil {
		writeSkillError(c, err)
		return
	}

	c.JSON(http.StatusOK, struct {
		Skills []skills.Summary `json:"skills"`
	}{Skills: items})
}

func (h *Handler) Get(c *gin.Context) {
	c.Header("Cache-Control", "no-store")

	service, err := h.skillService(c)
	if err != nil {
		httpx.Error(c, err)
		return
	}
	item, err := service.Get(c.Request.Context(), c.Param("name"))
	if err != nil {
		writeSkillError(c, err)
		return
	}

	c.JSON(http.StatusOK, item)
}

func writeSkillError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, skills.ErrInvalidName):
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid skill name."})
	case errors.Is(err, skills.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "Skill not found. It may have been moved or removed."})
	default:
		log.Printf("Skills request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not load skills. Check the server logs and try again."})
	}
}

func (h *Handler) skillService(c *gin.Context) (*skills.Service, error) {
	return skills.NewScopedService(c.Request.Context(), h.directories, sessions.DirectoryContext{
		AppName: c.Query("appName"), UserID: c.Query("userId"), SessionID: c.Query("sessionId"), ProjectID: c.Query("projectId"),
	})
}
