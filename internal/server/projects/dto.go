package projects

type CreateRequest struct {
	Name      string `json:"name"`
	Directory string `json:"directory"`
}

type RenameRequest struct {
	Name string `json:"name"`
}
