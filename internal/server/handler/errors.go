package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"google.golang.org/adk/v2/session"
)

func fail(c *gin.Context, status int, message string) {
	c.AbortWithStatusJSON(status, gin.H{"error": message})
}

func sessionError(c *gin.Context, err error) {
	if errors.Is(err, session.ErrNotFound) {
		fail(c, http.StatusNotFound, "Session not found.")
		return
	}
	fail(c, http.StatusInternalServerError, "Session storage operation failed.")
}

func decodeJSON(c *gin.Context, dst any, allowEmpty bool) bool {
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	err := decoder.Decode(dst)
	if allowEmpty && errors.Is(err, io.EOF) {
		return true
	}
	if err == nil {
		// Accept exactly one JSON value, including when the body is chunked.
		err = decoder.Decode(new(any))
		if errors.Is(err, io.EOF) {
			return true
		}
	}
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		fail(c, http.StatusRequestEntityTooLarge, "Request body is too large.")
	} else {
		fail(c, http.StatusBadRequest, "Expected a single valid JSON request body with supported fields.")
	}
	return false
}
