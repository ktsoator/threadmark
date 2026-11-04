package sessions

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"google.golang.org/adk/v2/session"
)

const ownerFile = ".threadmark-workspace.json"

type managedOwner struct {
	ManagedID string `json:"managedId"`
	Ref
}

// ManagedDirectory is derived from managedId, never stored as a path.
// Project sessions use Project.Directory and do not own a managed directory.
func (s *Service) ManagedDirectory(stored session.Session) string {
	id := stateString(stored, managedIDKey)
	if ProjectIDOf(stored) != "" || !validManagedID(id) {
		return ""
	}
	return filepath.Join(s.dataDir, "workspaces", id)
}

func validManagedID(id string) bool {
	parsed, err := uuid.Parse(id)
	return err == nil && parsed.String() == id
}

func (s *Service) allocateManaged(ref Ref) (string, error) {
	root, err := s.managedRoot()
	if err != nil {
		return "", err
	}
	defer root.Close()
	id := uuid.NewString()
	if err := root.Mkdir(id, 0700); err != nil {
		return "", err
	}
	data, _ := json.Marshal(managedOwner{ManagedID: id, Ref: ref})
	file, err := root.OpenFile(filepath.Join(id, ownerFile), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err == nil {
		_, err = file.Write(data)
		closeErr := file.Close()
		if err == nil {
			err = closeErr
		}
	}
	if err != nil {
		_ = root.Remove(filepath.Join(id, ownerFile))
		_ = root.Remove(id)
		return "", err
	}
	return id, nil
}

func (s *Service) managedRoot() (*os.Root, error) {
	path := filepath.Join(s.dataDir, "workspaces")
	real, err := filepath.EvalSymlinks(path)
	if err != nil || real != path {
		return nil, fmt.Errorf("managed workspaces root is unavailable or has changed")
	}
	return os.OpenRoot(path)
}

func (s *Service) removeManaged(ref Ref, id string, onlyEmpty bool) error {
	if !validManagedID(id) {
		return fmt.Errorf("invalid managed directory ID")
	}
	root, err := s.managedRoot()
	if err != nil {
		return err
	}
	defer root.Close()
	info, err := root.Lstat(id)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("working directory was replaced")
	}
	file, err := root.Open(filepath.Join(id, ownerFile))
	if err != nil {
		return err
	}
	var owner managedOwner
	err = json.NewDecoder(io.LimitReader(file, 4096)).Decode(&owner)
	_ = file.Close()
	if err != nil || owner.ManagedID != id || owner.Ref != ref {
		return fmt.Errorf("working directory ownership could not be verified")
	}
	if onlyEmpty {
		folder, err := root.Open(id)
		if err != nil {
			return err
		}
		names, err := folder.Readdirnames(-1)
		_ = folder.Close()
		if err != nil {
			return err
		}
		if len(names) != 1 || names[0] != ownerFile {
			return fmt.Errorf("new working directory contains files; retained at %s", filepath.Join(s.dataDir, "workspaces", id))
		}
	}
	// Root.RemoveAll bounds traversal and does not follow child symlinks.
	return root.RemoveAll(id)
}
