package server

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func listApps(c *gin.Context) {
	c.JSON(http.StatusOK, []string{"assistant"})
}
