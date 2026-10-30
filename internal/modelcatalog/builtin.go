package modelcatalog

import (
	"bytes"
	_ "embed"
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
