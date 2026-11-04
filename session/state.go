package session

import (
	"encoding/json"
	"strings"

	adksession "google.golang.org/adk/v2/session"
)

// ProjectIDKey and ManagedIDKey are reserved binding keys maintained by Service.
const ProjectIDKey = "threadmark:projectId"
const ManagedIDKey = "threadmark:managedId"

func stateString(stored adksession.Session, key string) string {
	value, _ := stored.State().Get(key)
	text, _ := value.(string)
	return text
}

func ProjectIDOf(stored adksession.Session) string {
	return stateString(stored, ProjectIDKey)
}

func ValidateState(state map[string]any) error {
	for key := range state {
		if strings.HasPrefix(key, "threadmark:") {
			return ErrReservedState
		}
	}
	if _, err := json.Marshal(state); err != nil {
		return ErrInvalidState
	}
	return nil
}

// ManagedIDOf returns the directory identifier of a standalone conversation.
func ManagedIDOf(stored adksession.Session) string { return stateString(stored, ManagedIDKey) }
