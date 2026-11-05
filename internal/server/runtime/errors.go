package runtime

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"google.golang.org/adk/v2/session"
)

const sessionIDKey = "runtime.sessionID"

type runFailure struct {
	Code  string `json:"code"`
	Error string `json:"error"`
}

func eventError(event *session.Event) error {
	if event != nil && (event.ErrorCode != "" || event.ErrorMessage != "" || event.Interrupted) {
		return fmt.Errorf("model response failed: code=%q message=%q interrupted=%t", event.ErrorCode, event.ErrorMessage, event.Interrupted)
	}
	return nil
}

func classifyRunError(err error) (int, runFailure) {
	var networkError net.Error
	isNetworkError := errors.As(err, &networkError)
	if errors.Is(err, context.DeadlineExceeded) || (isNetworkError && networkError.Timeout()) {
		return http.StatusGatewayTimeout, runFailure{"MODEL_TIMEOUT", "The model response timed out. Please try again."}
	}
	if isNetworkError || errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, io.EOF) {
		return http.StatusBadGateway, runFailure{"MODEL_CONNECTION_ERROR", "The connection to the model service was interrupted. Please try again."}
	}
	return http.StatusInternalServerError, runFailure{"RUN_FAILED", "The agent could not finish the task. Check the server logs for details."}
}

func logRunError(c *gin.Context, invocationID string, started time.Time, err error) {
	log.Printf("Agent run failed: session=%q invocation=%q elapsed=%s error=%v",
		c.GetString(sessionIDKey), invocationID, time.Since(started).Round(time.Millisecond), err)
}
