package server

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/server/middleware"
	modelhttp "github.com/ktsoator/threadmark/internal/server/models"
	projecthttp "github.com/ktsoator/threadmark/internal/server/projects"
	runtimehttp "github.com/ktsoator/threadmark/internal/server/runtime"
	sessionhttp "github.com/ktsoator/threadmark/internal/server/sessions"
	skillhttp "github.com/ktsoator/threadmark/internal/server/skills"
)

// NewRouter registers all backend routes and their shared middleware.
func NewRouter(cfg Config) (*gin.Engine, error) {
	if cfg.Projects == nil || cfg.Sessions == nil || cfg.Runtime == nil || cfg.Models == nil || cfg.DeleteProject == nil || cfg.SkillsFor == nil {
		return nil, fmt.Errorf("project, session, runtime services, model list and project deletion and skills coordinators are required")
	}
	projectHandler := projecthttp.New(cfg.Projects, cfg.DeleteProject)
	sessionHandler := sessionhttp.New(cfg.Sessions)
	runtimeHandler := runtimehttp.New(cfg.Runtime, cfg.SSEWriteTimeout)
	skillHandler := skillhttp.New(cfg.SkillsFor)
	modelHandler := modelhttp.New(cfg.Models)
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.HandleMethodNotAllowed = true
	router.Use(middleware.Origin(middleware.OriginConfig{
		BindHost: cfg.BindHost, AllowedOrigins: cfg.AllowedOrigins,
	}), middleware.BodyLimit(cfg.MaxPayloadSize))
	if err := router.SetTrustedProxies(nil); err != nil {
		return nil, err
	}

	router.GET("/health", health)
	router.HEAD("/health", health)

	api := router.Group("/api")
	api.GET("/health", health)
	api.HEAD("/health", health)
	api.GET("/list-apps", listApps)
	api.HEAD("/list-apps", listApps)
	api.GET("/models", modelHandler.List)
	api.HEAD("/models", modelHandler.List)
	api.POST("/run", runtimeHandler.Run)
	api.POST("/run_sse", runtimeHandler.RunSSE)
	api.POST("/title", runtimeHandler.GenerateTitle)

	sessions := api.Group("/apps/:app_name/users/:user_id/sessions")
	sessions.GET("", sessionHandler.List)
	sessions.HEAD("", sessionHandler.List)
	sessions.POST("", sessionHandler.Create)
	sessions.POST("/:session_id", sessionHandler.Create)
	sessions.GET("/:session_id", sessionHandler.Get)
	sessions.HEAD("/:session_id", sessionHandler.Get)
	sessions.PATCH("/:session_id", sessionHandler.Update)
	sessions.DELETE("/:session_id", sessionHandler.Delete)
	sessions.POST("/:session_id/messages", sessionHandler.AppendMessage)

	projects := api.Group("/apps/:app_name/users/:user_id/projects")
	projects.GET("", projectHandler.List)
	projects.POST("", projectHandler.Create)
	projects.PATCH("/:project_id", projectHandler.Rename)
	projects.DELETE("/:project_id", projectHandler.Delete)

	skills := api.Group("/skills")
	skills.GET("", skillHandler.List)
	skills.GET("/:name", skillHandler.Get)

	registerMethodFallback(router)

	return router, nil
}
