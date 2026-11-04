import { ChevronRight, FilePenLine, LoaderCircle } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import CopyButton from '../../../components/ui/CopyButton';
import { cn } from '../../../lib/cn';
import type { ActivityBlock } from '../lib/conversation';

const previewLineLimit = 2000;

export default function WriteToolBlock({
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
  const path = typeof block.args?.path === 'string' ? block.args.path : '';
  const filename = path.split(/[\\/]/).at(-1) || path;
  const content =
    typeof block.args?.content === 'string' ? block.args.content : undefined;
  const output =
    typeof block.result?.output === 'string' ? block.result.output : '';
  const error =
    typeof block.result?.error === 'string' ? block.result.error : '';
  const lines = useMemo(() => {
    if (!content) return [];
    const lines = content.split(/\r?\n/);
    // A trailing newline terminates the last line; it does not add an empty row.
    if (content.endsWith('\n')) lines.pop();
    return lines;
  }, [content]);
  const count =
    block.status === 'done' && content !== undefined
      ? `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`
      : '';
  const hasDetails = content !== undefined || !!output || !!error;
  const open = hasDetails && (expanded ?? failed);
  const label = running
    ? 'Writing'
    : failed
      ? 'Write failed'
      : stopped
        ? 'Write stopped'
        : 'Wrote';
  const heading = (
    <>
      {running ? (
        <LoaderCircle
          size={14}
          aria-hidden="true"
          className="shrink-0 animate-spin"
        />
      ) : !nested ? (
        <FilePenLine size={14} aria-hidden="true" className="shrink-0" />
      ) : null}
      <span className="shrink-0" role={running ? 'status' : undefined}>
        {label}
      </span>
      {filename && <span className="min-w-0 truncate">{filename}</span>}
      {count && (
        <span className="shrink-0 text-caption text-accent tabular-nums">
          {count}
        </span>
      )}
      {hasDetails && (
        <ChevronRight
          size={12}
          aria-hidden="true"
          className={cn(
            'shrink-0 transition-[opacity,transform] duration-150',
            open
              ? 'rotate-90'
              : 'opacity-0 group-hover/write:opacity-100 group-focus-visible/write:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        />
      )}
    </>
  );
  const headingClass = cn(
    'group/write flex max-w-full items-center gap-1.5 rounded-control text-left text-body text-muted-foreground transition-colors duration-150',
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
          aria-label={`${label}${path ? ` ${path}` : ''}${count ? `, ${count}` : ''}`}
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
        <div className={headingClass} title={path || label}>
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
            {(running || stopped || failed) && (
              <p
                className={cn(
                  'max-h-40 overflow-auto border-b border-border px-3 py-2 text-body whitespace-pre-wrap [overflow-wrap:anywhere]',
                  failed
                    ? 'bg-diff-remove-bg text-error'
                    : 'bg-surface-subtle text-muted-foreground',
                )}
              >
                {running
                  ? 'Write in progress.'
                  : stopped
                    ? 'The write stopped before completion was confirmed.'
                    : error || 'The write failed.'}
              </p>
            )}
            {content !== undefined ? (
              <>
                <div className="flex min-w-0 items-center gap-3 border-b border-border bg-surface-subtle py-0.5 pr-1 pl-3 text-caption text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate" title={path}>
                    {path || 'File contents'}
                  </span>
                  {block.status !== 'done' && (
                    <span className="shrink-0">Requested contents</span>
                  )}
                  <CopyButton label="Copy write contents" text={content} />
                </div>
                {lines.length ? (
                  <div
                    role="region"
                    aria-label="Write contents"
                    tabIndex={0}
                    className="max-h-80 overflow-auto overscroll-contain py-1 font-mono text-code leading-5 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent [tab-size:2]"
                  >
                    <table className="w-full border-collapse whitespace-pre">
                      <tbody>
                        {lines.slice(0, previewLineLimit).map((line, index) => (
                          <tr key={index}>
                            <td
                              aria-label={`Line ${index + 1}`}
                              className="w-px min-w-10 pr-3 pl-3 text-right text-muted-foreground tabular-nums select-none"
                            >
                              {index + 1}
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
                    {block.status === 'done'
                      ? 'Wrote an empty file.'
                      : 'Empty content.'}
                  </p>
                )}
                {lines.length > previewLineLimit && (
                  <p className="border-t border-border bg-surface-subtle px-3 py-2 text-caption text-muted-foreground">
                    Showing the first {previewLineLimit} lines. Copy to get the
                    full content.
                  </p>
                )}
              </>
            ) : (
              <p className="max-h-80 overflow-auto px-3 py-2 text-body whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
                {output || 'No write content was recorded.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
