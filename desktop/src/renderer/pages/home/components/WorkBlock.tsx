import { ChevronRight, LoaderCircle, Wrench } from 'lucide-react';
import { lazy, Suspense, useId, useState } from 'react';
import { cn } from '../../../lib/cn';
import type { ActivityBlock, MessageBlock } from '../lib/conversation';
import BashToolBlock from './BashToolBlock';
import EditToolBlock from './EditToolBlock';
import ReadToolBlock from './ReadToolBlock';
import ThoughtBlock from './ThoughtBlock';
import WriteToolBlock from './WriteToolBlock';

const Markdown = lazy(() => import('../../../components/markdown/Markdown'));

function ToolBlock({
  block,
  nested,
}: {
  block: Extract<ActivityBlock, { type: 'tool' }>;
  nested: boolean;
}) {
  const running = block.status === 'running';
  const failed = block.status === 'error';
  const detail = block.args?.path;
  const label = failed
    ? `Failed ${block.name}`
    : block.status === 'stopped'
      ? `Stopped ${block.name}`
      : `${running ? 'Running' : 'Used'} ${block.name}`;

  return (
    <div
      className={cn(
        'flex min-w-0 cursor-pointer items-start gap-2 text-body text-muted-foreground transition-colors duration-150 hover:text-foreground',
        nested ? 'py-0.5' : 'py-1',
        failed && 'text-error',
      )}
      role={running ? 'status' : undefined}
    >
      {running ? (
        <LoaderCircle
          size={14}
          aria-hidden="true"
          className="mt-0.5 shrink-0 animate-spin"
        />
      ) : !nested ? (
        <Wrench size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
      ) : null}
      <span
        className="min-w-0 truncate"
        title={typeof detail === 'string' ? `${label} ${detail}` : label}
      >
        {label}
        {typeof detail === 'string' && detail && <span> {detail}</span>}
      </span>
    </div>
  );
}

export default function WorkBlock({
  blocks,
  active,
  onToggle,
}: {
  blocks: MessageBlock[];
  active: boolean;
  onToggle: () => void;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState<{
    active: boolean;
    open: boolean;
  }>();
  // Completing a run collapses its process, including manually opened details.
  const open = expanded?.active === active ? expanded.open : active;
  const label = active ? 'Working…' : 'Work';

  return (
    <div className="min-w-0">
      <div className="border-b border-border pb-1">
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex min-h-8 items-center gap-2 rounded-control text-body text-muted-foreground transition-colors duration-150 hover:text-foreground"
          onClick={() => {
            onToggle();
            setExpanded({ active, open: !open });
          }}
        >
          {active && (
            <LoaderCircle
              size={14}
              aria-hidden="true"
              className="animate-spin motion-reduce:animate-none"
            />
          )}
          <span role={active ? 'status' : undefined}>{label}</span>
          <ChevronRight
            size={14}
            aria-hidden="true"
            className={cn(
              'transition-transform duration-180 ease-out motion-reduce:transition-none',
              open && 'rotate-90',
            )}
          />
        </button>
      </div>
      <div id={contentId} hidden={!open} className="space-y-1 pt-2">
        {open &&
          blocks.map((block, index) =>
            block.type === 'text' ? (
              <Suspense
                key={index}
                fallback={
                  <div className="text-message whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {block.text}
                  </div>
                }
              >
                <Markdown text={block.text} streaming={block.streaming} />
              </Suspense>
            ) : block.type === 'thought' ? (
              <ThoughtBlock
                key={index}
                text={block.text}
                streaming={block.streaming}
                onToggle={onToggle}
              />
            ) : block.name === 'bash' ? (
              <BashToolBlock
                key={block.id}
                block={block}
                nested={false}
                onToggle={onToggle}
              />
            ) : block.name === 'read' ? (
              <ReadToolBlock
                key={block.id}
                block={block}
                nested={false}
                onToggle={onToggle}
              />
            ) : block.name === 'edit' ? (
              <EditToolBlock
                key={block.id}
                block={block}
                nested={false}
                onToggle={onToggle}
              />
            ) : block.name === 'write' ? (
              <WriteToolBlock
                key={block.id}
                block={block}
                nested={false}
                onToggle={onToggle}
              />
            ) : (
              <ToolBlock key={block.id} block={block} nested={false} />
            ),
          )}
      </div>
    </div>
  );
}
