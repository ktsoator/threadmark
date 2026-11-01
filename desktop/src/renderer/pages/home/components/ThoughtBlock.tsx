import { ChevronRight, LoaderCircle } from 'lucide-react';
import { lazy, Suspense, useId, useState } from 'react';
import { cn } from '../../../lib/cn';

const Markdown = lazy(() => import('../../../components/markdown/Markdown'));

export default function ThoughtBlock({
  text,
  streaming,
  nested = false,
  onToggle,
}: {
  text: string;
  streaming: boolean;
  nested?: boolean;
  onToggle: () => void;
}) {
  const contentId = useId();
  const [expanded, setExpanded] = useState<boolean>();
  // Follow the stream until the user explicitly chooses to expand or collapse.
  const open = expanded ?? streaming;
  const label = streaming ? 'Thinking…' : 'Thought';

  return (
    <div className="min-w-0">
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
        {streaming ? (
          <LoaderCircle size={14} aria-hidden="true" className="animate-spin" />
        ) : (
          <ChevronRight
            size={14}
            aria-hidden="true"
            className={cn(
              'transition-transform duration-180 ease-out',
              open && 'rotate-90',
              nested && 'order-last',
            )}
          />
        )}
        <span role={streaming ? 'status' : undefined}>{label}</span>
      </button>
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
              'mt-0.5 pb-1 text-body leading-[18px] text-muted-foreground',
              '[&_.markdown]:text-body [&_.markdown]:leading-[18px] [&_.markdown]:text-muted-foreground',
              '[&_.markdown-block]:mt-1.5 [&_.markdown-block:first-child]:mt-0',
              !nested && 'pl-[22px]',
            )}
          >
            <Suspense
              fallback={
                <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {text}
                </div>
              }
            >
              <Markdown text={text} streaming={streaming} />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
