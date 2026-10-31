import { ChevronRight, LoaderCircle, Wrench } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '../../../lib/cn';
import type { ActivityBlock } from '../lib/conversation';
import ThoughtBlock from './ThoughtBlock';

function ToolBlock({
  block,
  nested,
}: {
  block: Extract<ActivityBlock, { type: 'tool' }>;
  nested: boolean;
}) {
  const running = block.status === 'running';
  const failed = block.status === 'error';
  const detail = block.name === 'bash' ? block.args?.command : block.args?.path;
  const action = {
    read: running ? 'Reading' : 'Read',
    write: running ? 'Writing' : 'Wrote',
    edit: running ? 'Editing' : 'Edited',
    bash: running ? 'Running' : 'Ran',
  }[block.name];
  const label = failed
    ? `Failed ${block.name}`
    : block.status === 'stopped'
      ? `Stopped ${block.name}`
      : action || `${running ? 'Running' : 'Used'} ${block.name}`;

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
  blocks: ActivityBlock[];
  active: boolean;
  onToggle: () => void;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState<boolean>();
  const grouped = blocks.length > 1;
  const open = !grouped || (expanded ?? active);
  const label = active ? 'Working…' : 'Work';

  return (
    <div className="min-w-0">
      {grouped && (
        <button
          type="button"
          aria-label={label}
          aria-expanded={open}
          aria-controls={contentId}
          className="flex w-fit items-center gap-2 rounded-control py-0.5 text-body text-muted-foreground transition-colors duration-150 hover:text-foreground"
          onClick={() => {
            onToggle();
            setExpanded(!open);
          }}
        >
          {active ? (
            <LoaderCircle
              size={14}
              aria-hidden="true"
              className="animate-spin"
            />
          ) : (
            <ChevronRight
              size={14}
              aria-hidden="true"
              className={cn(
                'transition-transform duration-180 ease-out',
                open && 'rotate-90',
              )}
            />
          )}
          <span role={active ? 'status' : undefined}>{label}</span>
        </button>
      )}
      <div
        id={contentId}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-180 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className={cn(
              grouped &&
                'mt-0.5 ml-[7px] space-y-0.5 border-l border-border pl-3.5',
            )}
          >
            {blocks.map((block, index) =>
              block.type === 'thought' ? (
                <ThoughtBlock
                  key={index}
                  text={block.text}
                  streaming={block.streaming}
                  nested={grouped}
                  onToggle={onToggle}
                />
              ) : (
                <ToolBlock key={block.id} block={block} nested={grouped} />
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
