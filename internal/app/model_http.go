package app

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"sync"
	"time"
)

var errModelIdleTimeout = fmt.Errorf("model response idle timeout: %w", context.DeadlineExceeded)

func newModelHTTPClient() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}).DialContext
	transport.ResponseHeaderTimeout = 90 * time.Second
	return &http.Client{Transport: &modelTransport{base: transport, idleTimeout: 120 * time.Second}}
}

// modelTransport bounds inactivity without imposing a total generation limit.
type modelTransport struct {
	base        http.RoundTripper
	idleTimeout time.Duration
}

func (t *modelTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	ctx, cancel := context.WithCancelCause(req.Context())
	response, err := t.base.RoundTrip(req.Clone(ctx))
	if err != nil {
		cancel(nil)
		return nil, err
	}
	body := &idleResponseBody{
		ReadCloser: response.Body, ctx: ctx, cancel: cancel,
		timeout: t.idleTimeout, lastActivity: time.Now(),
	}
	body.timer = time.AfterFunc(t.idleTimeout, body.expire)
	response.Body = body
	return response, nil
}

func (t *modelTransport) CloseIdleConnections() {
	if transport, ok := t.base.(interface{ CloseIdleConnections() }); ok {
		transport.CloseIdleConnections()
	}
}

type idleResponseBody struct {
	io.ReadCloser
	ctx          context.Context
	cancel       context.CancelCauseFunc
	mu           sync.Mutex
	timer        *time.Timer
	timeout      time.Duration
	lastActivity time.Time
	done         bool
}

func (b *idleResponseBody) expire() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.done {
		return
	}
	// A reset can race with a callback that has already started.
	if remaining := b.timeout - time.Since(b.lastActivity); remaining > 0 {
		b.timer.Reset(remaining)
		return
	}
	b.done = true
	b.cancel(errModelIdleTimeout)
}

func (b *idleResponseBody) Read(p []byte) (int, error) {
	n, err := b.ReadCloser.Read(p)
	b.mu.Lock()
	defer b.mu.Unlock()
	if cause := context.Cause(b.ctx); cause != nil {
		err = cause
	}
	if err != nil {
		b.stop()
	} else if n > 0 && !b.done {
		b.lastActivity = time.Now()
		b.timer.Reset(b.timeout)
	}
	return n, err
}

func (b *idleResponseBody) Close() error {
	b.mu.Lock()
	b.stop()
	b.mu.Unlock()
	return b.ReadCloser.Close()
}

// stop is called with mu held, including when EOF is reached before Close.
func (b *idleResponseBody) stop() {
	b.done = true
	b.timer.Stop()
	b.cancel(nil)
}
