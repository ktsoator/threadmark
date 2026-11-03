package server

import (
	"net/http"
	"slices"
	"strings"

	"github.com/gin-gonic/gin"
)

func registerMethodFallback(router *gin.Engine) {
	router.NoMethod(func(c *gin.Context) {
		var allowed []string
		for _, route := range router.Routes() {
			if matchesResource(route.Path, c.Request.URL.Path) && !slices.Contains(allowed, route.Method) {
				allowed = append(allowed, route.Method)
			}
		}
		if !slices.Contains(allowed, http.MethodOptions) {
			allowed = append(allowed, http.MethodOptions)
		}
		slices.Sort(allowed)
		c.Header("Allow", strings.Join(allowed, ", "))
		if c.Request.Method == http.MethodOptions {
			c.Status(http.StatusNoContent)
			return
		}
		c.AbortWithStatusJSON(http.StatusMethodNotAllowed, gin.H{"error": "Method not allowed."})
	})
}

// Registered resources use fixed segments and Gin's named parameters.
func matchesResource(pattern, path string) bool {
	parts, actual := strings.Split(pattern, "/"), strings.Split(path, "/")
	if len(parts) != len(actual) {
		return false
	}
	for i, part := range parts {
		if strings.HasPrefix(part, ":") && actual[i] != "" {
			continue
		}
		if part != actual[i] {
			return false
		}
	}
	return true
}
