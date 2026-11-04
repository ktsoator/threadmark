package server

import (
	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/server/handler"
	"github.com/ktsoator/threadmark/internal/server/middleware"
)

// NewRouter registers all backend routes and their shared middleware.
func NewRouter(cfg Config) (*gin.Engine, error) {
	h, err := handler.New(handler.Config{
		AgentLoader: cfg.AgentLoader, SessionService: cfg.SessionService,
		SkillService: cfg.SkillService, SSEWriteTimeout: cfg.SSEWriteTimeout,
	})
	if err != nil {
		return nil, err
	}
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.HandleMethodNotAllowed = true
	router.Use(middleware.Origin(middleware.OriginConfig{
		BindHost: cfg.BindHost, AllowedOrigins: cfg.AllowedOrigins,
	}), middleware.BodyLimit(cfg.MaxPayloadSize))
	if err := router.SetTrustedProxies(nil); err != nil {
		return nil, err
	}

	router.GET("/health", h.Health)
	router.HEAD("/health", h.Health)

	api := router.Group("/api")
	api.GET("/health", h.Health)
	api.HEAD("/health", h.Health)
	api.GET("/list-apps", h.ListApps)
	api.HEAD("/list-apps", h.ListApps)
	api.POST("/run", h.Run)
	api.POST("/run_sse", h.RunSSE)

	sessions := api.Group("/apps/:app_name/users/:user_id/sessions")
	sessions.GET("", h.ListSessions)
	sessions.HEAD("", h.ListSessions)
	sessions.POST("", h.CreateSession)
	sessions.POST("/:session_id", h.CreateSession)
	sessions.GET("/:session_id", h.GetSession)
	sessions.HEAD("/:session_id", h.GetSession)
	sessions.PATCH("/:session_id", h.UpdateSession)
	sessions.DELETE("/:session_id", h.DeleteSession)
	sessions.POST("/:session_id/messages", h.AppendMessage)

	skills := api.Group("/skills")
	skills.GET("", h.ListSkills)
	skills.GET("/:name", h.GetSkill)

	registerMethodFallback(router)

	return router, nil
}
