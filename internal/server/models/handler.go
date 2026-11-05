package models

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/runtime"
)

type Handler struct {
	models *runtime.ModelList
}

func New(models *runtime.ModelList) *Handler {
	return &Handler{models: models}
}

func (h *Handler) List(c *gin.Context) {
	c.JSON(http.StatusOK, h.models)
}
