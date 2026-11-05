package runtime

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"iter"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/server/events"
	"github.com/ktsoator/threadmark/internal/server/httpx"
	"google.golang.org/adk/v2/session"
)

func (h *Handler) RunSSE(c *gin.Context) {
	run, ok := h.prepareRun(c)
	if !ok {
		return
	}
	h.stream(c, run.Events, 15*time.Second)
}

func (h *Handler) stream(c *gin.Context, source func(context.Context) iter.Seq2[*session.Event, error], heartbeat time.Duration) {
	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()
	started := time.Now()
	invocationID := ""
	stream := sseWriter{writer: c.Writer, controller: streamController(c.Writer), timeout: h.sseTimeout}
	if err := stream.setDeadline(); err != nil {
		logRunError(c, invocationID, started, err)
		httpx.Fail(c, http.StatusInternalServerError, "Could not initialize the response stream.")
		return
	}
	c.Header("Content-Type", "text/event-stream; charset=UTF-8")
	c.Header("Cache-Control", "no-cache")
	c.Header("X-Accel-Buffering", "no")
	c.Writer.WriteHeaderNow()
	if err := stream.writeFrame(": connected\n\n"); err != nil {
		logRunError(c, invocationID, started, err)
		return
	}
	type result struct {
		event *session.Event
		err   error
	}
	results := make(chan result)
	go func() {
		defer close(results)
		// The producer runs outside Gin's recovery middleware.
		defer func() {
			if recovered := recover(); recovered != nil {
				err := fmt.Errorf("agent panic: %v\n%s", recovered, debug.Stack())
				select {
				case results <- result{err: err}:
				case <-ctx.Done():
				}
			}
		}()
		for event, err := range source(ctx) {
			select {
			case results <- result{event, err}:
			case <-ctx.Done():
				return
			}
			if err != nil || eventError(event) != nil {
				return
			}
		}
	}()
	ticker := time.NewTicker(heartbeat)
	defer ticker.Stop()
	write := func(event string, data []byte) bool {
		if err := stream.writeEvent(event, data); err != nil {
			logRunError(c, invocationID, started, err)
			return false
		}
		return true
	}
	fail := func(err error) {
		logRunError(c, invocationID, started, err)
		_, failure := classifyRunError(err)
		data, _ := json.Marshal(failure)
		write("error", data)
	}
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := stream.writeFrame(": ping\n\n"); err != nil {
				logRunError(c, invocationID, started, err)
				return
			}
		case item, ok := <-results:
			if ctx.Err() != nil {
				return
			}
			if !ok {
				write("done", []byte(`{}`))
				return
			}
			if item.err != nil {
				fail(item.err)
				return
			}
			event := item.event
			if event == nil {
				continue
			}
			invocationID = event.InvocationID
			if err := eventError(event); err != nil {
				fail(err)
				return
			}
			data, err := json.Marshal(events.FromSessionEvent(*event))
			if err != nil {
				fail(fmt.Errorf("encode agent event: %w", err))
				return
			}
			if !write("", data) {
				return
			}
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

type sseWriter struct {
	writer     http.ResponseWriter
	controller *http.ResponseController
	timeout    time.Duration
}

func (s *sseWriter) setDeadline() error {
	var deadline time.Time
	if s.timeout > 0 {
		deadline = time.Now().Add(s.timeout)
	}
	return s.controller.SetWriteDeadline(deadline)
}

func (s *sseWriter) writeEvent(event string, data []byte) error {
	prefix := ""
	if event != "" {
		prefix = "event: " + event + "\n"
	}
	return s.writeFrame(prefix + "data: " + string(data) + "\n\n")
}

func (s *sseWriter) writeFrame(frame string) error {
	if err := s.setDeadline(); err != nil {
		return err
	}
	if _, err := io.WriteString(s.writer, frame); err != nil {
		return err
	}
	return s.controller.Flush()
}
