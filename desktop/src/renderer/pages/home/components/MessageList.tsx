import { ArrowDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import IconButton from '../../../components/ui/IconButton';
import type { ChatMessage } from '../lib/conversation';
import AssistantMessage from './AssistantMessage';
import WorkProcess from './WorkProcess';

export default function MessageList({
  messages,
  busy,
  loading,
}: {
  messages: ChatMessage[];
  busy: boolean;
  loading: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showScroll, setShowScroll] = useState(false);
  const last = messages.at(-1);
  const userMessageCount = messages.filter(
    (message) => message.role === 'user',
  ).length;

  useEffect(() => {
    following.current = true;
    const scroll = scrollRef.current;
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
    setShowScroll(false);
  }, [userMessageCount]);

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const scroll = scrollRef.current;
      if (scroll && following.current) scroll.scrollTop = scroll.scrollHeight;
    });
    if (contentRef.current) observer.observe(contentRef.current);
    if (scrollRef.current) observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-4 [scrollbar-gutter:stable] desktop:px-8"
        onScroll={() => {
          const scroll = scrollRef.current;
          if (!scroll) return;
          following.current =
            scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
          setShowScroll(!following.current);
        }}
      >
        <div
          ref={contentRef}
          className="mx-auto max-w-reading pt-5 pb-8 desktop:pt-10"
        >
          {loading ? (
            <p
              className="py-8 text-center text-ui text-muted-foreground"
              role="status"
            >
              Loading conversation…
            </p>
          ) : (
            <div
              role="log"
              aria-label="Conversation"
              aria-live="off"
              className="space-y-8"
            >
              {messages.map((message) => (
                <article
                  key={message.id}
                  aria-label={
                    message.role === 'user' ? 'Your message' : 'Agent response'
                  }
                  className="min-w-0"
                >
                  {message.role === 'user' ? (
                    <div className="ml-auto w-fit max-w-[85%] rounded-2xl bg-sidebar px-4 py-2.5 text-message whitespace-pre-wrap [overflow-wrap:anywhere]">
                      {message.blocks
                        .map((block) =>
                          block.type === 'text' ? block.text : '',
                        )
                        .join('')}
                    </div>
                  ) : (
                    <AssistantMessage
                      message={message}
                      active={busy && message === last}
                    />
                  )}
                </article>
              ))}
              {busy && last?.role !== 'assistant' && (
                <WorkProcess blocks={[]} active />
              )}
            </div>
          )}
        </div>
      </div>
      {showScroll && (
        <IconButton
          label="Scroll to latest"
          className="absolute bottom-3 left-1/2 -translate-x-1/2 border border-border bg-background"
          onClick={() => {
            following.current = true;
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
              behavior: 'smooth',
            });
          }}
        >
          <ArrowDown size={15} />
        </IconButton>
      )}
    </div>
  );
}
