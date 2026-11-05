package bash

import (
	"io"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/ktsoator/threadmark/tools/internal/toolutil"
)

// readCommandOutput reads a bounded tail; the extra byte identifies a cut line.
func readCommandOutput(file *os.File) (toolutil.Result, error) {
	info, err := file.Stat()
	if err != nil {
		return toolutil.Result{FullOutputPath: file.Name()}, err
	}
	size := min(info.Size(), int64(toolutil.MaxOutputBytes+1))
	data := make([]byte, int(size))
	n, err := file.ReadAt(data, info.Size()-size)
	if err != nil && err != io.EOF {
		return toolutil.Result{FullOutputPath: file.Name()}, err
	}
	text, truncated := outputTail(strings.ToValidUTF8(string(data[:n]), "\uFFFD"), info.Size() > int64(n))
	truncated = truncated || info.Size() > toolutil.MaxOutputBytes
	out := toolutil.Result{Output: text, Truncated: truncated}
	if truncated {
		out.FullOutputPath = file.Name()
	}
	return out, nil
}

func outputTail(text string, prefixOmitted bool) (string, bool) {
	start := 0
	if len(text) > toolutil.MaxOutputBytes {
		start = len(text) - toolutil.MaxOutputBytes
		for start < len(text) && !utf8.RuneStart(text[start]) {
			start++
		}
	}
	// Prefer whole lines. Keep a partial tail only when the last line itself is too long.
	if (start > 0 && text[start-1] != '\n') || (start == 0 && prefixOmitted) {
		if newline := strings.IndexByte(text[start:], '\n'); newline >= 0 && start+newline+1 < len(text) {
			start += newline + 1
		}
	}
	end := len(text)
	if end > start && text[end-1] == '\n' {
		end--
	}
	lines := 1
	for i := end - 1; i >= start; i-- {
		if text[i] == '\n' {
			if lines == toolutil.MaxOutputLines {
				start = i + 1
				break
			}
			lines++
		}
	}
	return text[start:], prefixOmitted || start > 0
}
