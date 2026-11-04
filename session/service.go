// Package session provides conversation operations backed by ADK sessions.
package session

import (
	"context"
	"time"

	adksession "google.golang.org/adk/v2/session"
)

// Service manages conversation state, project bindings, and managed directories.
// Implementations must share their busy gate between writes, deletion, and agent runs.
type Service interface {
	Create(context.Context, *CreateRequest) (*CreateResponse, error)
	Get(context.Context, *GetRequest) (*GetResponse, error)
	List(context.Context, *ListRequest) (*ListResponse, error)
	Update(context.Context, *UpdateRequest) (*UpdateResponse, error)
	AppendMessage(context.Context, *AppendMessageRequest) (*AppendMessageResponse, error)
	Delete(context.Context, *DeleteRequest) (*DeleteResponse, error)
	// Acquire excludes concurrent writes and deletion until release is called.
	// The returned release function is safe to call more than once.
	Acquire(Ref) (release func(), err error)
	// ManagedDirectory returns an empty string for project sessions.
	ManagedDirectory(adksession.Session) string
	DirectoryFor(context.Context, DirectoryContext) (string, error)
}

// Ref identifies a conversation within its application and user scope.
type Ref struct {
	AppName   string
	UserID    string
	SessionID string
}

type CreateRequest struct {
	Ref
	ProjectID string
	State     map[string]any
	Events    []*adksession.Event
}

type CreateResponse = adksession.CreateResponse

type GetRequest struct {
	Ref
	NumRecentEvents int
	After           time.Time
}

type GetResponse = adksession.GetResponse

type ListRequest = adksession.ListRequest
type ListResponse = adksession.ListResponse

type UpdateRequest struct {
	Ref
	StateDelta map[string]any
}

type UpdateResponse struct{ Session adksession.Session }

type AppendMessageRequest struct {
	Ref
	Text string
}

type AppendMessageResponse struct{ Session adksession.Session }

type DeleteRequest struct {
	Ref
	// DeleteDirectory removes an owned managed directory after deleting the conversation.
	// Project directories are always retained.
	DeleteDirectory bool
}

type CleanupStatus string

const (
	CleanupNotApplicable CleanupStatus = "notApplicable"
	CleanupNotAttempted  CleanupStatus = "notAttempted"
	CleanupRetained      CleanupStatus = "retained"
	CleanupDeleted       CleanupStatus = "deleted"
	CleanupFailed        CleanupStatus = "failed"
)

// DeleteResponse describes directory handling after the conversation is deleted.
// CleanupError reports a directory cleanup failure without undoing conversation deletion.
type DeleteResponse struct {
	Cleanup      CleanupStatus
	Directory    string
	CleanupError error
}

// DirectoryContext selects a project or conversation. Leave both IDs empty for no directory.
type DirectoryContext struct {
	AppName   string
	UserID    string
	SessionID string
	ProjectID string
}
