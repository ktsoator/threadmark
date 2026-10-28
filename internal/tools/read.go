package tools

import (
	"fmt"
	"os"
	"unicode/utf8"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
)

type readArgs struct {
	Path string `json:"path" jsonschema:"Path to the text file, relative or absolute."`
}

func newRead(cwd string) (tool.Tool, error) {
	return newTool("read", "Read the complete contents of a UTF-8 text file.",
		func(_ agent.Context, args readArgs) (result, error) {
			content, err := readText(resolvePath(cwd, args.Path))
			return result{Output: content}, err
		})
}

func readText(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	if !utf8.Valid(data) {
		return "", fmt.Errorf("file is not UTF-8 text: %s", path)
	}
	return string(data), nil
}
