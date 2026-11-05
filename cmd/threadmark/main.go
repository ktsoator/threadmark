package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ktsoator/threadmark/internal/app"
	"github.com/ktsoator/threadmark/internal/server"
)

func main() {
	log.SetFlags(0)
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := app.LoadConfig()
	if err != nil {
		return err
	}

	bindHost, _, err := net.SplitHostPort(cfg.Addr)
	if err != nil {
		return fmt.Errorf("invalid server address %q: %w", cfg.Addr, err)
	}

	application, err := app.New(ctx, cfg)
	if err != nil {
		return err
	}

	defer application.Close()

	router, err := server.NewRouter(server.Config{
		Projects: application.Projects, Sessions: application.Sessions,
		Runtime: application.Runtime, Models: application.Models, DeleteProject: application.DeleteProject,
		SkillsFor: application.SkillsFor, BindHost: bindHost,
	})

	if err != nil {
		return err
	}

	listener, err := net.Listen("tcp", cfg.Addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer listener.Close()

	srv := &http.Server{
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
		// Cancel active agent runs when the process receives a shutdown signal.
		BaseContext: func(net.Listener) context.Context { return ctx },
	}
	serveErr := make(chan error, 1)
	go func() { serveErr <- srv.Serve(listener) }()
	log.Printf("API: http://%s/api. Press Ctrl+C to exit.", listener.Addr())

	select {
	case err := <-serveErr:
		return fmt.Errorf("serve: %w", err)
	case <-ctx.Done():
		stop()
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		_ = srv.Close()
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := <-serveErr; !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve: %w", err)
	}

	return nil
}
