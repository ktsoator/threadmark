import { ChevronRight, FileText, LoaderCircle } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import CopyButton from '../../../components/ui/CopyButton';
import { cn } from '../../../lib/cn';
import type { ActivityBlock } from '../lib/conversation';

export default function ReadToolBlock({
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
  const path = typeof block.args?.path === 'string' ? block.args.path : '';
  const filename = path.split(/[\\/]/).at(-1) || path;
  const output =
    typeof block.result?.output === 'string' ? block.result.output : undefined;
  const error =
    typeof block.result?.error === 'string' ? block.result.error : '';
  const truncated = block.result?.truncated === true;
  const nextOffset = block.result?.nextOffset;
  const offset = block.args?.offset;
  const start =
    typeof offset === 'number' && Number.isSafeInteger(offset) && offset > 0
      ? offset
      : 1;
  const lines = useMemo(() => {
    if (!output) return [];
    const lines = output.split(/\r?\n/);
    // A trailing newline terminates the last line; it does not add an empty row.
    if (output.endsWith('\n')) lines.pop();
    return lines;
  }, [output]);
  const end = start + lines.length - 1;
  const range = lines.length
    ? start === end
      ? `Line ${start}`
      : `Lines ${start}–${end}`
    : '';
  const hasContent = output !== undefined && (!failed || output.length > 0);
  const hasDetails = hasContent || !!error;
  const open = hasDetails && (expanded ?? failed);
  const label = running
    ? 'Reading'
    : failed
      ? 'Read failed'
      : block.status === 'stopped'
        ? 'Read stopped'
        : 'Read';
  const heading = (
    <>
      {running ? (
        <LoaderCircle
          size={14}
          aria-hidden="true"
          className="shrink-0 animate-spin"
        />
      ) : !nested ? (
        <FileText size={14} aria-hidden="true" className="shrink-0" />
      ) : null}
      <span className="shrink-0">{label}</span>
      {filename && <span className="min-w-0 truncate">{filename}</span>}
      {range && (
        <span
          className="shrink-0 text-caption text-accent tabular-nums"
          aria-label={range}
        >
          {start === end ? `L${start}` : `L${start}–${end}`}
        </span>
      )}
      {truncated && !failed && (
        <span className="shrink-0 text-caption">Partial</span>
      )}
      {hasDetails && (
        <ChevronRight
          size={12}
          aria-hidden="true"
          className={cn(
            'shrink-0 transition-[opacity,transform] duration-150',
            open
              ? 'rotate-90'
              : 'opacity-0 group-hover/read:opacity-100 group-focus-visible/read:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        />
      )}
    </>
  );
  const headingClass = cn(
    'group/read flex max-w-full items-center gap-1.5 rounded-control text-left text-body text-muted-foreground transition-colors duration-150',
    nested ? 'py-0.5' : 'py-1',
    hasDetails && 'hover:text-foreground',
    failed && 'text-error',
  );

  return (
    <div className="min-w-0">
      {hasDetails ? (
        <button
          type="button"
          title={path || label}
          aria-label={`${label}${path ? ` ${path}` : ''}${range ? `, ${range}` : ''}`}
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
        <div
          className={headingClass}
          title={path || label}
          role={running ? 'status' : undefined}
        >
          {heading}
        </div>
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
            {hasContent && (
              <>
                <div className="flex min-w-0 items-center gap-3 border-b border-border bg-surface-subtle py-0.5 pr-1 pl-3 text-caption text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate" title={path}>
                    {path || 'File contents'}
                  </span>
                  <CopyButton label="Copy read contents" text={output} />
                </div>
                {lines.length ? (
                  <div
                    role="region"
                    aria-label="Read contents"
                    tabIndex={0}
                    className="max-h-80 overflow-auto overscroll-contain py-1 font-mono text-code leading-5 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent [tab-size:2]"
                  >
                    <table className="w-full border-collapse whitespace-pre">
                      <tbody>
                        {lines.map((line, index) => (
                          <tr key={index}>
                            <td
                              aria-label={`Line ${start + index}`}
                              className="w-px min-w-10 pr-3 pl-3 text-right text-muted-foreground tabular-nums select-none"
                            >
                              {start + index}
                            </td>
                            <td className="pr-3 text-foreground">
                              {line || ' '}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-3 py-3 text-body text-muted-foreground">
                    {truncated
                      ? 'No content was returned.'
                      : 'This file is empty.'}
                  </p>
                )}
                {truncated && !error && (
                  <p className="border-t border-border bg-surface-subtle px-3 py-2 text-caption text-muted-foreground">
                    {typeof nextOffset === 'number' &&
                    Number.isSafeInteger(nextOffset) &&
                    nextOffset > end
                      ? `More content is available from line ${nextOffset}.`
                      : 'Only part of the file is shown.'}
                  </p>
                )}
              </>
            )}
            {error && (
              <div className="max-h-40 overflow-auto bg-diff-remove-bg px-3 py-2 text-body whitespace-pre-wrap text-error [overflow-wrap:anywhere]">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
