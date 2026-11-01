package server

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"google.golang.org/adk/v2/server/adkrest"
)

// NewRouter creates the HTTP entry point for project and ADK endpoints.
func NewRouter(cfg adkrest.ServerConfig) (*gin.Engine, error) {
	adkServer, err := adkrest.NewServer(cfg)
	if err != nil {
		return nil, fmt.Errorf("create ADK server: %w", err)
	}
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	if err := router.SetTrustedProxies(nil); err != nil {
		return nil, err
	}
	registerADK(router, adkServer)
	return router, nil
}
