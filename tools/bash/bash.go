package bash

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"

	"github.com/ktsoator/threadmark/tools/internal/toolutil"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
)

type bashArgs struct {
	Command string `json:"command" jsonschema:"Non-empty Bash command to run in the working directory. Quote paths containing spaces."`
	Timeout int    `json:"timeout,omitempty" jsonschema:"Maximum runtime in seconds. Omit or use zero for 60 seconds; set a positive integer for longer commands."`
}

const description = `Run a command in a fresh, non-interactive Bash shell in the working directory. Use it to list or search files and run programs, builds, and tests. Directory and environment changes do not persist between calls.
Waits for completion, with a default timeout of 60 seconds. Returns combined stdout and stderr in output, and exitCode when available. Check error as well as exitCode; a negative exit code means the process was terminated by a signal.
Output keeps the last 2000 lines or 50 KiB, whichever is reached first. When truncated is true, fullOutputPath points to the complete log; use read or a focused bash command to inspect the missing portion.`

// New creates the bash tool using cwd as its working directory.
func New(cwd string) (tool.Tool, error) {
	return toolutil.New("bash", description,
		func(ctx agent.Context, args bashArgs) (toolutil.Result, error) {
			if strings.TrimSpace(args.Command) == "" {
				return toolutil.Result{}, fmt.Errorf("command must not be empty")
			}
			if args.Timeout == 0 {
				args.Timeout = 60
			}
			timeout, err := time.ParseDuration(fmt.Sprintf("%ds", args.Timeout))
			if err != nil || timeout <= 0 {
				return toolutil.Result{}, fmt.Errorf("timeout must be a positive number of seconds within the supported duration range")
			}
			runCtx, cancel := context.WithTimeout(ctx, timeout)
			defer cancel()
			log, err := os.CreateTemp("", "threadmark-bash-*.log")
			if err != nil {
				return toolutil.Result{}, fmt.Errorf("create command output log: %w", err)
			}
			keepLog := false
			defer func() {
				log.Close()
				if !keepLog || ctx.Err() != nil {
					os.Remove(log.Name())
				}
			}()
			cmd := exec.CommandContext(runCtx, "bash", "-c", args.Command)
			cmd.Dir = cwd
			// Keep os/exec's pipes so WaitDelay still bounds inherited output handles.
			writer := io.MultiWriter(log)
			cmd.Stdout, cmd.Stderr = writer, writer
			// Stop child processes as well as the shell on timeout or cancellation.
			cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
			cmd.Cancel = func() error {
				err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
				if errors.Is(err, syscall.ESRCH) {
					return os.ErrProcessDone
				}
				return err
			}
			cmd.WaitDelay = time.Second
			err = cmd.Run()
			out, outputErr := readCommandOutput(log)
			keepLog = out.FullOutputPath != ""
			if cmd.ProcessState != nil {
				code := cmd.ProcessState.ExitCode()
				out.ExitCode = &code
			}
			if runCtx.Err() != nil {
				return out, errors.Join(fmt.Errorf("command interrupted: %w", runCtx.Err()), outputErr)
			}
			return out, errors.Join(err, outputErr)
		})
}
