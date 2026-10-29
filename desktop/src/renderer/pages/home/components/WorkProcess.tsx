import { ChevronRight, LoaderCircle, Wrench } from 'lucide-react';
import { useId, useState } from 'react';
import LazyMarkdown from '../../../components/markdown/LazyMarkdown';
import { cn } from '../../../lib/cn';
import type { MessageBlock } from '../lib/conversation';
import Reasoning from './Reasoning';

type ToolBlock = Extract<MessageBlock, { type: 'tool' }>;

function toolLabel(tool: ToolBlock) {
  if (tool.status === 'error') return `Failed: ${tool.name}`;
  if (tool.status === 'stopped') return `Stopped: ${tool.name}`;
  const running = tool.status === 'running';
  switch (tool.name) {
    case 'read':
      return running ? 'Reading files' : 'Read files';
    case 'write':
      return running ? 'Writing files' : 'Wrote files';
    case 'edit':
      return running ? 'Editing files' : 'Edited files';
    case 'bash':
      return running ? 'Running commands' : 'Ran commands';
    default:
      return `${running ? 'Running' : 'Used'} ${tool.name}`;
  }
}

function groupActivity(blocks: MessageBlock[]) {
  const groups: (Exclude<MessageBlock, ToolBlock> | ToolBlock[])[] = [];
  for (const block of blocks) {
    if (block.type !== 'tool') {
      groups.push(block);
    } else {
      const last = groups.at(-1);
      if (Array.isArray(last)) last.push(block);
      else groups.push([block]);
    }
  }
  return groups;
}

export default function WorkProcess({
  blocks,
  active,
  stopped = false,
}: {
  blocks: MessageBlock[];
  active: boolean;
  stopped?: boolean;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState<boolean>();
  const open = expanded ?? (active || stopped);
  const label = active ? 'Working…' : stopped ? 'Stopped' : 'Worked';

  return (
    <section aria-label="Work process" className="min-w-0">
      <div className="border-b border-border pb-1.5">
        {blocks.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={contentId}
            className="-ml-1 flex min-h-6 w-fit items-center gap-1.5 rounded-control px-1 text-ui text-muted-foreground transition-colors hover:text-secondary-foreground"
            onClick={() => setExpanded(!open)}
          >
            <span>{label}</span>
            <ChevronRight
              size={13}
              strokeWidth={1.75}
              aria-hidden="true"
              className={cn(
                'shrink-0 transition-transform duration-150',
                open && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <div className="flex min-h-6 items-center text-ui text-muted-foreground">
            {label}
          </div>
        )}
      </div>
      <div id={contentId} hidden={!open || !blocks.length}>
        {open && blocks.length > 0 && (
          <div className="space-y-1 pt-2">
            {groupActivity(blocks).map((block, index) => {
              if (Array.isArray(block)) {
                const running = block.some((tool) => tool.status === 'running');
                const labels = [...new Set(block.map(toolLabel))];
                const Icon = running ? LoaderCircle : Wrench;
                return (
                  <div
                    key={index}
                    className="flex min-h-6 items-start gap-2 py-0.5 text-ui leading-5 text-muted-foreground"
                  >
                    <Icon
                      size={14}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 shrink-0',
                        running && 'animate-spin',
                      )}
                    />
                    <span className="[overflow-wrap:anywhere]">
                      {labels.join(', ')}
                    </span>
                  </div>
                );
              }
              if (block.type === 'reasoning') {
                return <Reasoning key={index} block={block} />;
              }
              return (
                <LazyMarkdown
                  key={index}
                  text={block.text}
                  streaming={block.streaming}
                  className="py-1"
                />
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
