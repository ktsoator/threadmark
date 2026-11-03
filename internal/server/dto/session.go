package dto

import (
	"maps"

	"google.golang.org/adk/v2/session"
)

type Session struct {
	ID             string         `json:"id"`
	AppName        string         `json:"appName"`
	UserID         string         `json:"userId"`
	LastUpdateTime int64          `json:"lastUpdateTime"`
	Events         []Event        `json:"events"`
	State          map[string]any `json:"state"`
}

type CreateSessionRequest struct {
	State  map[string]any `json:"state"`
	Events []Event        `json:"events"`
}

type UpdateSessionRequest struct {
	StateDelta map[string]any `json:"stateDelta"`
}

func FromSession(stored session.Session) Session {
	state := map[string]any{}
	maps.Insert(state, stored.State().All())
	events := make([]Event, 0, stored.Events().Len())
	for event := range stored.Events().All() {
		events = append(events, FromSessionEvent(*event))
	}
	return Session{
		ID: stored.ID(), AppName: stored.AppName(), UserID: stored.UserID(),
		LastUpdateTime: stored.LastUpdateTime().Unix(), Events: events, State: state,
	}
}
