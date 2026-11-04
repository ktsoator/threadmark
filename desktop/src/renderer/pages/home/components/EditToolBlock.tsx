import { ChevronRight, FilePenLine, LoaderCircle } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import CopyButton from '../../../components/ui/CopyButton';
import { cn } from '../../../lib/cn';
import type { ActivityBlock } from '../lib/conversation';
import { parseDiff, type ParsedDiff } from '../lib/diff';

function DiffView({
  diff,
  parsed,
}: {
  diff: string;
  parsed: ParsedDiff | null;
}) {
  return (
    <div
      role="region"
      aria-label="File changes"
      tabIndex={0}
      className="max-h-80 overflow-auto overscroll-contain font-mono text-code leading-5 outline-offset-[-2px] focus-visible:outline-2 focus-visible:outline-accent [tab-size:2]"
    >
      {parsed ? (
        <table className="w-full border-collapse whitespace-pre">
          <tbody>
            {parsed.lines.map((line, index) =>
              line.kind === 'hunk' || line.kind === 'note' ? (
                <tr key={index}>
                  <td
                    colSpan={4}
                    className={cn(
                      'px-3 py-1 text-muted-foreground',
                      line.kind === 'hunk' ? 'bg-surface-subtle' : 'italic',
                    )}
                  >
                    {line.text}
                  </td>
                </tr>
              ) : (
                <tr
                  key={index}
                  className={cn(
                    line.kind === 'addition' && 'bg-diff-add-bg',
                    line.kind === 'deletion' && 'bg-diff-remove-bg',
                  )}
                >
                  <td
                    aria-label={
                      line.oldLine ? `Old line ${line.oldLine}` : undefined
                    }
                    className="w-px min-w-9 px-2 text-right text-muted-foreground tabular-nums select-none"
                  >
                    {line.oldLine}
                  </td>
                  <td
                    aria-label={
                      line.newLine ? `New line ${line.newLine}` : undefined
                    }
                    className="w-px min-w-9 px-2 text-right text-muted-foreground tabular-nums select-none"
                  >
                    {line.newLine}
                  </td>
                  <td
                    className={cn(
                      'w-px px-1 select-none',
                      line.kind === 'addition' && 'text-diff-add',
                      line.kind === 'deletion' && 'text-diff-remove',
                    )}
                  >
                    {line.kind === 'addition'
                      ? '+'
                      : line.kind === 'deletion'
                        ? '−'
                        : ' '}
                  </td>
                  <td className="pr-3 text-foreground">{line.text || ' '}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      ) : (
        <pre className="px-3 py-2">{diff}</pre>
      )}
    </div>
  );
}

export default function EditToolBlock({
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
  const diff = typeof block.result?.diff === 'string' ? block.result.diff : '';
  const error =
    typeof block.result?.error === 'string' ? block.result.error : '';
  const output =
    typeof block.result?.output === 'string' ? block.result.output : '';
  const parsed = useMemo(() => (diff ? parseDiff(diff) : null), [diff]);
  const firstChangedLine = block.result?.firstChangedLine;
  const hasDetails = !!(diff || error || output);
  const open = hasDetails && (expanded ?? failed);
  const label = running
    ? 'Editing'
    : failed
      ? 'Edit failed'
      : block.status === 'stopped'
        ? 'Edit stopped'
        : 'Edited';
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
      <span className="shrink-0">{label}</span>
      {filename && <span className="min-w-0 truncate">{filename}</span>}
      {parsed && (
        <span
          aria-label={`${parsed.additions} ${parsed.additions === 1 ? 'line' : 'lines'} added, ${parsed.deletions} ${parsed.deletions === 1 ? 'line' : 'lines'} removed`}
          className="flex shrink-0 gap-1.5 font-mono text-caption tabular-nums"
        >
          <span className="text-diff-add">+{parsed.additions}</span>
          <span className="text-diff-remove">−{parsed.deletions}</span>
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
              : 'opacity-0 group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        />
      )}
    </>
  );
  const headingClass = cn(
    'group/edit flex max-w-full items-center gap-1.5 rounded-control text-left text-body text-muted-foreground transition-colors duration-150',
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
          aria-label={`${label}${path ? ` ${path}` : ''}`}
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
            {diff && (
              <>
                <div className="flex min-w-0 items-center gap-3 border-b border-border bg-surface-subtle py-0.5 pr-1 pl-3 text-caption text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate" title={path}>
                    {path || 'File changes'}
                  </span>
                  {typeof firstChangedLine === 'number' &&
                    Number.isSafeInteger(firstChangedLine) &&
                    firstChangedLine > 0 && (
                      <span className="shrink-0">Line {firstChangedLine}</span>
                    )}
                  <CopyButton label="Copy diff" text={diff} />
                </div>
                <DiffView diff={diff} parsed={parsed} />
              </>
            )}
            {error ? (
              <div className="max-h-40 overflow-auto bg-diff-remove-bg px-3 py-2 text-body whitespace-pre-wrap text-error [overflow-wrap:anywhere]">
                {error}
              </div>
            ) : !diff && output ? (
              <div className="max-h-40 overflow-auto px-3 py-2 text-body whitespace-pre-wrap text-secondary-foreground [overflow-wrap:anywhere]">
                {output}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
