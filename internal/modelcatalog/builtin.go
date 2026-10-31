package modelcatalog

import (
	"bytes"
	_ "embed"
	"fmt"
	"sync"
)

//go:embed data/models.json
var builtinJSON []byte

var loadBuiltin = sync.OnceValues(func() (Catalog, error) {
	return Load(bytes.NewReader(builtinJSON))
})

// Builtin loads the embedded snapshot once and caches the catalog or error.
// The returned map and its nested data are shared and must be treated as read-only.
// Loading performs no file or network I/O. Updates require syncing and rebuilding.
func Builtin() (Catalog, error) {
	return loadBuiltin()
}

// Lookup finds a model in the built-in catalog, loading it on first use.
// It returns an error if loading fails or the provider/model pair is absent.
// Nested data is shared with the cached catalog and must be treated as read-only.
func Lookup(providerID, modelID string) (Model, error) {
	catalog, err := Builtin()
	if err != nil {
		return Model{}, err
	}
	info, ok := catalog.Lookup(providerID, modelID)
	if !ok {
		return Model{}, fmt.Errorf("modelcatalog: model %q/%q not found", providerID, modelID)
	}
	return info, nil
}
