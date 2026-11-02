package server

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func registerADK(router *gin.Engine, handler http.Handler) {
	router.Any("/health", gin.WrapH(handler))
	api := router.Group("/api")
	forward := gin.WrapH(http.StripPrefix("/api", handler))
	// Mount separate paths so project endpoints can also live under /api.
	// ADK handles method validation, request bodies, and streamed responses.
	for _, path := range []string{
		"/health",
		"/version",
		"/list-apps",
		"/apps/*path",
		"/run",
		"/run_sse",
		"/run_live",
	} {
		api.Any(path, forward)
	}
}
