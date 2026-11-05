import { Check, ChevronRight, LoaderCircle, Terminal } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import stripAnsi from 'strip-ansi';
import CopyButton from '../../../components/ui/CopyButton';
import { cn } from '../../../lib/cn';
import type { ActivityBlock } from '../lib/conversation';

export default function BashToolBlock({
  block,
  nested,
  onToggle,
}: {
  block: Extract<ActivityBlock, { type: 'tool' }>;
  nested: boolean;
  onToggle: () => void;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState<boolean>();
  const running = block.status === 'running';
  const failed = block.status === 'error';
  const stopped = block.status === 'stopped';
  const command =
    typeof block.args?.command === 'string' ? block.args.command : '';
  const summary = command.replace(/\s+/g, ' ').trim();
  const rawOutput =
    typeof block.result?.output === 'string' ? block.result.output : undefined;
  const output = useMemo(
    () =>
      rawOutput === undefined
        ? undefined
        : stripAnsi(rawOutput).replace(/\r\n?/g, '\n'),
    [rawOutput],
  );
  const error =
    typeof block.result?.error === 'string' ? block.result.error : '';
  const code = block.result?.exitCode;
  const exitCode =
    typeof code === 'number' && Number.isSafeInteger(code) ? code : undefined;
  const exitLabel =
    exitCode === undefined
      ? ''
      : exitCode < 0
        ? 'Terminated'
        : `Exit ${exitCode}`;
  const truncated = block.result?.truncated === true;
  const fullOutputPath =
    typeof block.result?.fullOutputPath === 'string'
      ? block.result.fullOutputPath
      : '';
  const hasDetails =
    !!command ||
    output !== undefined ||
    !!error ||
    !!exitLabel ||
    !!fullOutputPath;
  const open = hasDetails && (expanded ?? failed);
  const label = running
    ? 'Running'
    : failed
      ? 'Failed'
      : stopped
        ? 'Stopped'
        : 'Ran';
  const heading = (
    <>
      {running ? (
        <LoaderCircle
          size={14}
          aria-hidden="true"
          className="shrink-0 animate-spin"
        />
      ) : !nested ? (
        <Terminal size={14} aria-hidden="true" className="shrink-0" />
      ) : null}
      <span className="shrink-0" role={running ? 'status' : undefined}>
        {label}
      </span>
      <span className="max-w-80 min-w-0 truncate font-mono">
        {summary || 'Bash'}
      </span>
      {!running && !failed && !stopped && exitCode === 0 && (
        <span className="inline-flex shrink-0 items-center gap-1 text-caption text-diff-add">
          <Check size={12} aria-hidden="true" />
          Success
        </span>
      )}
      {truncated && <span className="shrink-0 text-caption">Partial</span>}
      {hasDetails && (
        <ChevronRight
          size={12}
          aria-hidden="true"
          className={cn(
            'shrink-0 transition-[opacity,transform] duration-150',
            open
              ? 'rotate-90'
              : 'opacity-0 group-hover/bash:opacity-100 group-focus-visible/bash:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        />
      )}
    </>
  );
  const headingClass = cn(
    'group/bash flex max-w-full items-center gap-1.5 rounded-control text-left text-body text-muted-foreground transition-colors duration-150',
    nested ? 'py-0.5' : 'py-1',
    hasDetails && 'hover:text-foreground',
    failed && 'text-error',
  );

  return (
    <div className="min-w-0">
      {hasDetails ? (
        <button
          type="button"
          title={command || 'Bash'}
          aria-label={`${label} ${summary || 'Bash'}`}
          aria-expanded={open}
          aria-controls={contentId}
          className={headingClass}
          onClick={() => {
            onToggle();
            setExpanded(!open);
          }}
        >
          {heading}
        </button>
      ) : (
        <div className={headingClass}>{heading}</div>
      )}
      <div
        id={contentId}
        hidden={!open}
        className={cn(
          'mt-1 mb-2 overflow-hidden rounded-control border border-border',
          !nested && 'ml-[22px]',
        )}
      >
        {open && (
          <>
            {command && (
              <div className="border-b border-border bg-surface-subtle">
                <div className="flex items-center justify-between py-0.5 pr-1 pl-3 text-caption text-muted-foreground">
                  <span>Command</span>
                  <CopyButton label="Copy command" text={command} />
                </div>
                <pre
                  role="region"
                  aria-label="Command"
                  tabIndex={0}
                  className="max-h-32 overflow-auto px-3 pb-2 font-mono text-code leading-5 whitespace-pre-wrap text-foreground outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent [overflow-wrap:anywhere]"
                >
                  {command}
                </pre>
              </div>
            )}
            <div className="flex min-h-8 items-center justify-between py-0.5 pr-1 pl-3 text-caption text-muted-foreground">
              <div className="flex items-center gap-2">
                <span>Output</span>
                {exitLabel && (
                  <span
                    className={cn(
                      'tabular-nums',
                      failed ? 'text-error' : 'text-muted-foreground',
                    )}
                    title={`Exit code: ${exitCode}`}
                  >
                    {exitLabel}
                  </span>
                )}
              </div>
              {output && (
                <CopyButton label="Copy command output" text={output} />
              )}
            </div>
            {output ? (
              <pre
                role="region"
                aria-label="Command output"
                tabIndex={0}
                className="max-h-80 overflow-auto overscroll-contain px-3 pb-2 font-mono text-code leading-5 text-foreground outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent [tab-size:2]"
              >
                {output}
              </pre>
            ) : (
              <p className="px-3 pb-3 text-body text-muted-foreground">
                {running
                  ? 'Waiting for the command to finish…'
                  : output !== undefined
                    ? 'No output.'
                    : stopped
                      ? 'The command stopped before returning output.'
                      : 'No output was recorded.'}
              </p>
            )}
            {error && (
              <div className="max-h-40 overflow-auto border-t border-border bg-diff-remove-bg px-3 py-2 text-body whitespace-pre-wrap text-error [overflow-wrap:anywhere]">
                {error}
              </div>
            )}
            {(truncated || fullOutputPath) && (
              <div className="border-t border-border bg-surface-subtle px-3 py-2 text-caption text-muted-foreground">
                {truncated && <p>Only the end of the output is shown.</p>}
                {fullOutputPath && (
                  <div className="mt-1 flex min-w-0 items-center gap-2">
                    <span className="shrink-0">Full log</span>
                    <span
                      className="min-w-0 flex-1 truncate font-mono"
                      title={fullOutputPath}
                    >
                      {fullOutputPath}
                    </span>
                    <CopyButton
                      label="Copy full log path"
                      text={fullOutputPath}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
