package handler

import (
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/skills"
)

func (h *Handler) ListSkills(c *gin.Context) {
	c.Header("Cache-Control", "no-store")

	items, err := h.skills.List(c.Request.Context())
	if err != nil {
		writeSkillError(c, err)
		return
	}

	c.JSON(http.StatusOK, struct {
		Skills []skills.Summary `json:"skills"`
	}{Skills: items})
}

func (h *Handler) GetSkill(c *gin.Context) {
	c.Header("Cache-Control", "no-store")

	item, err := h.skills.Get(c.Request.Context(), c.Param("name"))
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
