import { ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import LazyMarkdown from '../../../components/markdown/LazyMarkdown';
import { cn } from '../../../lib/cn';
import type { ReasoningBlock } from '../lib/conversation';

const textClass =
  'text-body leading-6 text-secondary-foreground [&_h1]:text-body [&_h2]:text-body [&_h3]:text-body [&_h4]:text-body [&_h5]:text-body [&_h6]:text-body';

export default function Reasoning({ block }: { block: ReasoningBlock }) {
  const contentId = useId();
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const thinking = block.status === 'thinking';

  useEffect(() => {
    const scroll = scrollRef.current;
    if (scroll && thinking && following.current) {
      scroll.scrollTop = scroll.scrollHeight;
    }
  }, [block.text, open, thinking]);

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        className="-ml-1 flex min-h-6 w-fit items-center gap-1 rounded-control px-1 text-ui text-muted-foreground transition-colors hover:text-secondary-foreground"
        onClick={() => {
          following.current = true;
          setOpen(!open);
        }}
      >
        {thinking
          ? 'Thinking…'
          : block.status === 'stopped'
            ? 'Thinking stopped'
            : 'Thought'}
        <ChevronRight
          size={12}
          strokeWidth={1.75}
          aria-hidden="true"
          className={cn(
            'shrink-0 transition-transform duration-150',
            open && 'rotate-90',
          )}
        />
      </button>
      <div id={contentId} hidden={!open}>
        {open && (
          <div
            ref={scrollRef}
            role="group"
            aria-label="Model reasoning"
            className="mt-1.5 mb-1 max-h-64 overflow-y-auto overscroll-contain border-l border-border pr-3 pl-3 [scrollbar-width:thin]"
            onScroll={() => {
              const scroll = scrollRef.current;
              if (scroll)
                following.current =
                  scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <
                  32;
            }}
          >
            <LazyMarkdown
              text={block.text}
              streaming={thinking}
              className={textClass}
            />
          </div>
        )}
      </div>
    </div>
  );
}
