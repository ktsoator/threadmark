package sessions

import "errors"

var (
	ErrReservedState        = errors.New("The conversation's project and directory are managed by Threadmark and cannot be changed.")
	ErrInvalidState         = errors.New("State must contain JSON values.")
	ErrStateScope           = errors.New("State updates may only change session-scoped keys.")
	ErrInvalidEvent         = errors.New("Initial events must not be null.")
	ErrBusy                 = errors.New("This conversation is busy. Stop its reply and try again.")
	ErrExists               = errors.New("A conversation with this ID already exists.")
	ErrInvalidMessage       = errors.New("Message text is required.")
	ErrInvalidCleanup       = errors.New("Only an automatically created working folder can be deleted.")
	ErrConflictingContext   = errors.New("Choose either a conversation or a project for skills.")
	ErrMissingContext       = errors.New("appName and userId are required for project or conversation skills.")
	ErrMissingDirectory     = errors.New("This conversation has no working directory.")
	ErrDirectoryUnavailable = errors.New("The working folder is unavailable. Restore the folder and try again.")
	ErrDirectoryChanged     = errors.New("The working folder has moved or been replaced.")
)
