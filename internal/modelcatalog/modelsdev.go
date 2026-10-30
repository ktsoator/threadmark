package modelcatalog

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
)

// Load reads exactly one models.dev JSON object. Unknown fields are ignored.
// Each call returns independent data and performs no network or credential I/O.
func Load(r io.Reader) (Catalog, error) {
	decoder := json.NewDecoder(r)
	var catalog Catalog
	if err := decoder.Decode(&catalog); err != nil {
		return nil, fmt.Errorf("modelcatalog: decode: %w", err)
	}
	if catalog == nil {
		return nil, fmt.Errorf("modelcatalog: expected a JSON object")
	}
	var extra json.RawMessage
	if err := decoder.Decode(&extra); err != io.EOF {
		if err != nil {
			return nil, fmt.Errorf("modelcatalog: trailing data: %w", err)
		}
		return nil, fmt.Errorf("modelcatalog: expected a single JSON object")
	}
	return catalog, nil
}

// UnmarshalJSON accepts a boolean or an object with a nonempty field name.
func (i *Interleaved) UnmarshalJSON(data []byte) error {
	data = bytes.TrimSpace(data)
	switch string(data) {
	case "null", "false":
		*i = Interleaved{}
		return nil
	case "true":
		*i = Interleaved{Enabled: true}
		return nil
	}
	var object struct {
		Field string `json:"field"`
	}
	if err := json.Unmarshal(data, &object); err != nil {
		return fmt.Errorf("modelcatalog: interleaved: %w", err)
	}
	if object.Field == "" {
		return fmt.Errorf("modelcatalog: interleaved: expected a nonempty field name")
	}
	*i = Interleaved{Enabled: true, Field: object.Field}
	return nil
}
