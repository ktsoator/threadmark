package session

import adksession "google.golang.org/adk/v2/session"

// Ref identifies a conversation within its application and user scope.
type Ref struct {
	AppName   string
	UserID    string
	SessionID string
}

// CreateRequest adds project binding and initial events to ADK session creation.
type CreateRequest struct {
	adksession.CreateRequest
	ProjectID string
	Events    []*adksession.Event
}

type UpdateRequest struct {
	Ref
	StateDelta map[string]any
	Title      *string
	// TitleSource defaults to manual. Generated titles only fill an unnamed conversation.
	TitleSource TitleSource
}

type AppendMessageRequest struct {
	Ref
	Text string
}

type DeleteRequest struct {
	adksession.DeleteRequest
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
