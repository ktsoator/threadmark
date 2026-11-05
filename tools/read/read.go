package read

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/ktsoator/threadmark/tools/internal/toolutil"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
)

type readArgs struct {
	Path   string `json:"path" jsonschema:"Path to an existing UTF-8 text file, relative to the working directory or absolute."`
	Offset int    `json:"offset,omitempty" jsonschema:"First line to read (1-based). Omit or use zero to start at line 1."`
	Limit  int    `json:"limit,omitempty" jsonschema:"Maximum lines to read. Omit or use zero for 2000. Values above 2000 are capped."`
}

const description = `Read an existing UTF-8 text file. Use this to inspect file contents before editing; it does not return image attachments.
Use offset and limit to select lines. Output contains plain text without line numbers, limited to 2000 complete lines or 50 KiB per call, whichever is reached first.
When truncated is true and nextOffset is provided, use it as the next offset to continue. If a single line exceeds the byte limit, use bash to inspect a bounded byte range.`

// New creates the read tool using cwd as its working directory.
func New(cwd string) (tool.Tool, error) {
	return toolutil.New("read", description,
		func(ctx agent.Context, args readArgs) (toolutil.Result, error) {
			if args.Offset < 0 || args.Limit < 0 {
				return toolutil.Result{}, fmt.Errorf("offset and limit must not be negative")
			}
			if args.Offset == 0 {
				args.Offset = 1
			}
			if args.Limit == 0 || args.Limit > toolutil.MaxOutputLines {
				args.Limit = toolutil.MaxOutputLines
			}
			return readLines(ctx, toolutil.ResolvePath(cwd, args.Path), args.Offset, args.Limit)
		})
}

func readLines(ctx context.Context, path string, offset, limit int) (toolutil.Result, error) {
	info, err := os.Stat(path)
	if err != nil {
		return toolutil.Result{}, err
	}
	if !info.Mode().IsRegular() {
		return toolutil.Result{}, fmt.Errorf("path is not a regular file: %s", path)
	}
	file, err := os.Open(path)
	if err != nil {
		return toolutil.Result{}, err
	}
	defer file.Close()

	reader := bufio.NewReader(file)
	var output strings.Builder
	var line []byte
	lineNumber, returned := 1, 0
	pending := false
	for {
		if err := ctx.Err(); err != nil {
			return toolutil.Result{}, err
		}
		fragment, err := reader.ReadSlice('\n')
		if err != nil && err != io.EOF && err != bufio.ErrBufferFull {
			return toolutil.Result{}, err
		}
		pending = pending || len(fragment) > 0
		if !pending {
			if offset > 1 && lineNumber <= offset {
				return toolutil.Result{}, fmt.Errorf("offset %d is beyond end of file (%d lines)", offset, lineNumber-1)
			}
			return toolutil.Result{Output: output.String()}, nil
		}
		if lineNumber >= offset {
			if returned >= limit || output.Len()+len(line)+len(fragment) > toolutil.MaxOutputBytes {
				if returned == 0 {
					return toolutil.Result{Truncated: true}, fmt.Errorf("line %d exceeds the 50 KiB read limit; use bash to inspect a bounded byte range", lineNumber)
				}
				return toolutil.Result{Output: output.String(), Truncated: true, NextOffset: lineNumber}, nil
			}
			line = append(line, fragment...)
		}
		if err == bufio.ErrBufferFull {
			continue
		}
		if lineNumber >= offset {
			if !utf8.Valid(line) {
				return toolutil.Result{}, fmt.Errorf("file is not UTF-8 text at line %d: %s", lineNumber, path)
			}
			output.Write(line)
			returned++
			line = line[:0]
		}
		if err == io.EOF {
			if lineNumber < offset {
				return toolutil.Result{}, fmt.Errorf("offset %d is beyond end of file (%d lines)", offset, lineNumber)
			}
			return toolutil.Result{Output: output.String()}, nil
		}
		lineNumber++
		pending = false
	}
}
