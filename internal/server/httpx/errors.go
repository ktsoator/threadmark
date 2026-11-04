package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/projects"
	"github.com/ktsoator/threadmark/internal/runtime"
	"github.com/ktsoator/threadmark/internal/sessions"
	"google.golang.org/adk/v2/session"
)

func Fail(c *gin.Context, status int, message string) {
	c.AbortWithStatusJSON(status, gin.H{"error": message})
}

func Error(c *gin.Context, err error) {
	status, code := http.StatusBadRequest, ""
	switch {
	case errors.Is(err, sessions.ErrReservedState):
		code = "WORKSPACE_IMMUTABLE"
	case errors.Is(err, sessions.ErrInvalidState), errors.Is(err, sessions.ErrStateScope):
		code = "INVALID_STATE"
	case errors.Is(err, sessions.ErrInvalidEvent):
		code = "INVALID_EVENT"
	case errors.Is(err, sessions.ErrBusy):
		status, code = http.StatusConflict, "SESSION_BUSY"
	case errors.Is(err, sessions.ErrExists):
		status, code = http.StatusConflict, "SESSION_EXISTS"
	case errors.Is(err, sessions.ErrInvalidMessage):
		code = "INVALID_MESSAGE"
	case errors.Is(err, sessions.ErrInvalidCleanup):
		code = "INVALID_CLEANUP"
	case errors.Is(err, sessions.ErrConflictingContext), errors.Is(err, sessions.ErrMissingContext):
		code = "INVALID_CONTEXT"
	case errors.Is(err, sessions.ErrMissingDirectory), errors.Is(err, sessions.ErrDirectoryUnavailable), errors.Is(err, sessions.ErrDirectoryChanged):
		status, code = http.StatusConflict, "WORKSPACE_UNAVAILABLE"
	case errors.Is(err, runtime.ErrAppNotFound):
		status, code = http.StatusNotFound, "APP_NOT_FOUND"
	case errors.Is(err, projects.ErrNotEmpty):
		status, code = http.StatusConflict, "PROJECT_NOT_EMPTY"
	}
	if code != "" {
		c.AbortWithStatusJSON(status, gin.H{"error": err.Error(), "code": code, "details": nil})
		return
	}
	if projectError(c, err) {
		return
	}
	if errors.Is(err, session.ErrNotFound) {
		Fail(c, http.StatusNotFound, "Session not found.")
		return
	}
	log.Printf("Application request: %v", err)
	Fail(c, http.StatusInternalServerError, "The operation could not be completed. Check the server logs and try again.")
}

func DecodeJSON(c *gin.Context, dst any, allowEmpty bool) bool {
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
		Fail(c, http.StatusRequestEntityTooLarge, "Request body is too large.")
	} else {
		Fail(c, http.StatusBadRequest, "Expected a single valid JSON request body with supported fields.")
	}
	return false
}

func projectError(c *gin.Context, err error) bool {
	var exists *projects.ExistsError
	if errors.As(err, &exists) {
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{
			"error": err.Error(), "code": "PROJECT_EXISTS", "details": gin.H{"projectId": exists.ProjectID},
		})
		return true
	}
	status, code := http.StatusBadRequest, ""
	switch {
	case errors.Is(err, projects.ErrNotFound):
		status, code = http.StatusNotFound, "PROJECT_NOT_FOUND"
	case errors.Is(err, projects.ErrInvalidName):
		code = "INVALID_NAME"
	case errors.Is(err, projects.ErrInvalidDirectory), errors.Is(err, projects.ErrReservedDirectory):
		code = "INVALID_DIRECTORY"
	case errors.Is(err, projects.ErrDirectoryUnavailable):
		status, code = http.StatusConflict, "WORKSPACE_UNAVAILABLE"
	default:
		return false
	}
	c.AbortWithStatusJSON(status, gin.H{"error": err.Error(), "code": code})
	return true
}
