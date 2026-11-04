package tools

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"syscall"
	"time"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
)

type bashArgs struct {
	Command string `json:"command" jsonschema:"Bash command to execute in the working directory."`
	Timeout int    `json:"timeout,omitempty" jsonschema:"Timeout in seconds. Omit or use zero for 60 seconds."`
}

func newBash(cwd string) (tool.Tool, error) {
	return newTool("bash", "Run a Bash command in a fresh shell. Returns combined stdout/stderr and exitCode. Shell state does not persist between calls.",
		func(ctx agent.Context, args bashArgs) (result, error) {
			if strings.TrimSpace(args.Command) == "" {
				return result{}, fmt.Errorf("command must not be empty")
			}
			if args.Timeout == 0 {
				args.Timeout = 60
			}
			timeout, err := time.ParseDuration(fmt.Sprintf("%ds", args.Timeout))
			if err != nil || timeout <= 0 {
				return result{}, fmt.Errorf("timeout must be a positive number of seconds within the supported duration range")
			}
			runCtx, cancel := context.WithTimeout(ctx, timeout)
			defer cancel()
			cmd := exec.CommandContext(runCtx, "bash", "-c", args.Command)
			cmd.Dir = cwd
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
			output, err := cmd.CombinedOutput()
			out := result{Output: string(output)}
			if cmd.ProcessState != nil {
				code := cmd.ProcessState.ExitCode()
				out.ExitCode = &code
			}
			if runCtx.Err() != nil {
				return out, fmt.Errorf("command interrupted: %w", runCtx.Err())
			}
			return out, err
		})
}
