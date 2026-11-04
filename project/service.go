package project

import (
	"context"
	"errors"
)

// Service manages projects within an application and user scope.
// It does not manage sessions; callers must check references before Delete.
type Service interface {
	Create(context.Context, *CreateRequest) (*CreateResponse, error)
	Get(context.Context, *GetRequest) (*GetResponse, error)
	List(context.Context, *ListRequest) (*ListResponse, error)
	Rename(context.Context, *RenameRequest) (*RenameResponse, error)
	// Delete removes the project record and always retains its directory.
	Delete(context.Context, *DeleteRequest) error
}

// CreateRequest represents a request to create a project.
type CreateRequest struct {
	AppName string
	UserID  string
	// Name defaults to the directory's base name when blank.
	Name string
	// Directory must be an absolute path to an existing directory.
	Directory string
}

type CreateResponse struct {
	Project *Project
}

type GetRequest struct {
	AppName   string
	UserID    string
	ProjectID string
}

type GetResponse struct {
	Project *Project
}

type ListRequest struct {
	AppName string
	UserID  string
}

type ListResponse struct {
	Projects []Project
}

type RenameRequest struct {
	AppName   string
	UserID    string
	ProjectID string
	Name      string
}

type RenameResponse struct {
	Project *Project
}

type DeleteRequest struct {
	AppName   string
	UserID    string
	ProjectID string
}

var (
	ErrInvalidRequest       = errors.New("Required project request fields are missing.")
	ErrNotFound             = errors.New("Project not found.")
	ErrNotEmpty             = errors.New("Delete the project's conversations before removing it. Your project files will be kept.")
	ErrInvalidName          = errors.New("Enter a project name of 1–120 characters.")
	ErrInvalidDirectory     = errors.New("Choose an existing folder using its absolute path.")
	ErrDirectoryUnavailable = errors.New("The working folder is unavailable. Restore the folder and try again.")
	ErrReservedDirectory    = errors.New("Choose a project folder outside Threadmark's managed workspaces.")
)

type ExistsError struct {
	ProjectID string
}

func (e *ExistsError) Error() string { return "This folder is already a project." }
