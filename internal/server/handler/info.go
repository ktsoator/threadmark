package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (h *Handler) ListApps(c *gin.Context) {
	apps := h.agents.ListAgents()
	if apps == nil {
		apps = []string{}
	}
	c.JSON(http.StatusOK, apps)
}
