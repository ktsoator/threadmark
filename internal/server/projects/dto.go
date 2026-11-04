package projects

import (
	"time"

	"github.com/ktsoator/threadmark/project"
)

type Project struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Directory string    `json:"directory"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func fromProject(p project.Project) Project {
	return Project{ID: p.ID, Name: p.Name, Directory: p.Directory, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt}
}

type CreateRequest struct {
	Name      string `json:"name"`
	Directory string `json:"directory"`
}

type RenameRequest struct {
	Name string `json:"name"`
}
