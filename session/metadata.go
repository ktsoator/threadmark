package session

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"

	adksession "google.golang.org/adk/v2/session"
	"gorm.io/gorm"
)

type TitleSource string

const (
	TitleNone      TitleSource = "none"
	TitleGenerated TitleSource = "generated"
	TitleManual    TitleSource = "manual"
)

// Metadata is display information stored independently of ADK session state.
type Metadata struct {
	Title       string
	TitleSource TitleSource
}

type storedMetadata struct {
	AppName   string `gorm:"primaryKey"`
	UserID    string `gorm:"primaryKey"`
	SessionID string `gorm:"primaryKey"`
	Metadata  `gorm:"embedded"`
}

func (storedMetadata) TableName() string { return "session_metadata" }

// GetMetadata returns empty metadata for sessions without a metadata record.
func (s *Service) GetMetadata(ctx context.Context, req *adksession.GetRequest) (*Metadata, error) {
	if req == nil || !validRef(Ref{AppName: req.AppName, UserID: req.UserID, SessionID: req.SessionID}) {
		return nil, ErrInvalidRequest
	}
	var row storedMetadata
	err := s.db.WithContext(ctx).Where("app_name = ? AND user_id = ? AND session_id = ?", req.AppName, req.UserID, req.SessionID).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &Metadata{TitleSource: TitleNone}, nil
	}
	if err != nil {
		return nil, err
	}
	return &row.Metadata, nil
}

// ListMetadata fetches titles in one query, keyed by session ID within the requested scope.
func (s *Service) ListMetadata(ctx context.Context, req *adksession.ListRequest) (map[string]Metadata, error) {
	if req == nil || req.AppName == "" || req.UserID == "" {
		return nil, ErrInvalidRequest
	}
	var rows []storedMetadata
	if err := s.db.WithContext(ctx).Where("app_name = ? AND user_id = ?", req.AppName, req.UserID).Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make(map[string]Metadata, len(rows))
	for _, row := range rows {
		result[row.SessionID] = row.Metadata
	}
	return result, nil
}

func validTitle(title string) (string, error) {
	title = strings.Join(strings.Fields(title), " ")
	if title == "" || utf8.RuneCountInString(title) > 120 {
		return "", ErrInvalidTitle
	}
	return title, nil
}
