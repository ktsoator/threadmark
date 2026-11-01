package server

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/ktsoator/threadmark/internal/skills"
	skillhttp "github.com/ktsoator/threadmark/internal/skills/http"
	"google.golang.org/adk/v2/server/adkrest"
)

type Config struct {
	ADK          adkrest.ServerConfig
	SkillService *skills.Service
}

// NewRouter creates the HTTP entry point for project and ADK endpoints.
func NewRouter(cfg Config) (*gin.Engine, error) {
	if cfg.SkillService == nil {
		return nil, fmt.Errorf("skill service is required")
	}
	adkServer, err := adkrest.NewServer(cfg.ADK)
	if err != nil {
		return nil, fmt.Errorf("create ADK server: %w", err)
	}
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	if err := router.SetTrustedProxies(nil); err != nil {
		return nil, err
	}
	registerADK(router, adkServer)

	api := router.Group("/api")
	skillhttp.RegisterRoutes(api, cfg.SkillService)

	return router, nil
}
