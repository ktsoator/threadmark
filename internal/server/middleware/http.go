package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const DefaultMaxPayloadSize int64 = 10 << 20

func BodyLimit(maxBytes int64) gin.HandlerFunc {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxPayloadSize
	}
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)
		c.Next()
	}
}

func Origin(cfg OriginConfig) gin.HandlerFunc {
	policy := NewOriginPolicy(cfg)
	return func(c *gin.Context) {
		if err := policy.Check(c.Request); err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Request host or origin is not allowed."})
			return
		}
		c.Next()
	}
}
