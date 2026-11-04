package sessions

import (
	"maps"

	"github.com/ktsoator/threadmark/internal/server/events"
	conversations "github.com/ktsoator/threadmark/internal/sessions"
	"google.golang.org/adk/v2/session"
)

type Session struct {
	ID               string         `json:"id"`
	AppName          string         `json:"appName"`
	UserID           string         `json:"userId"`
	LastUpdateTime   int64          `json:"lastUpdateTime"`
	Events           []events.Event `json:"events"`
	State            map[string]any `json:"state"`
	ProjectID        *string        `json:"projectId"`
	ManagedDirectory *string        `json:"managedDirectory"`
}

type CreateRequest struct {
	ProjectID string         `json:"projectId,omitempty"`
	State     map[string]any `json:"state"`
	Events    []events.Event `json:"events"`
}

type UpdateRequest struct {
	StateDelta map[string]any `json:"stateDelta"`
}

type AppendMessageRequest struct {
	Text string `json:"text"`
}

func FromSession(stored session.Session, managedDirectory string) Session {
	state := map[string]any{}
	maps.Insert(state, stored.State().All())
	history := make([]events.Event, 0, stored.Events().Len())
	for event := range stored.Events().All() {
		history = append(history, events.FromSessionEvent(*event))
	}
	var projectID *string
	if id := conversations.ProjectIDOf(stored); id != "" {
		projectID = &id
	}
	var directory *string
	if managedDirectory != "" {
		directory = &managedDirectory
	}
	return Session{
		ID: stored.ID(), AppName: stored.AppName(), UserID: stored.UserID(),
		LastUpdateTime: stored.LastUpdateTime().Unix(), Events: history, State: state,
		ProjectID: projectID, ManagedDirectory: directory,
	}
}
