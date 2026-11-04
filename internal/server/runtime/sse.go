package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/server/events"
	"github.com/ktsoator/threadmark/internal/server/httpx"
)

func (h *Handler) RunSSE(c *gin.Context) {
	run, ok := h.prepareRun(c)
	if !ok {
		return
	}
	defer run.Release()
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	controller := streamController(c.Writer)
	var deadline time.Time
	if h.sseTimeout > 0 {
		deadline = time.Now().Add(h.sseTimeout)
	}
	if err := controller.SetWriteDeadline(deadline); err != nil {
		httpx.Fail(c, http.StatusInternalServerError, "Could not initialize the response stream.")
		return
	}
	c.Header("Content-Type", "text/event-stream; charset=UTF-8")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")
	c.Writer.WriteHeaderNow()
	if err := controller.Flush(); err != nil {
		return
	}
	for event, err := range run.events(ctx) {
		if err != nil {
			if ctx.Err() == nil {
				_ = writeSSE(c.Writer, controller, "error", []byte(`{"error":"Agent execution failed."}`))
			}
			cancel()
			return
		}
		if event == nil {
			continue
		}
		data, err := json.Marshal(events.FromSessionEvent(*event))
		if err != nil {
			_ = writeSSE(c.Writer, controller, "error", []byte(`{"error":"Could not encode the agent event."}`))
			cancel()
			return
		}
		if err := writeSSE(c.Writer, controller, "", data); err != nil {
			// Cancel before breaking iteration, so the producer's cleanup sees it.
			cancel()
			return
		}
	}
}

func streamController(writer gin.ResponseWriter) *http.ResponseController {
	// Gin's Flush discards transport errors. Flush the underlying writer after
	// WriteHeaderNow so failed writes end the run and Gin still tracks headers.
	if unwrapped, ok := writer.(interface{ Unwrap() http.ResponseWriter }); ok {
		return http.NewResponseController(unwrapped.Unwrap())
	}
	return http.NewResponseController(writer)
}

func writeSSE(writer http.ResponseWriter, controller *http.ResponseController, event string, data []byte) error {
	prefix := ""
	if event != "" {
		prefix = "event: " + event + "\n"
	}
	if _, err := fmt.Fprintf(writer, "%sdata: %s\n\n", prefix, data); err != nil {
		return err
	}
	return controller.Flush()
}
