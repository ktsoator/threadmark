import { ArrowDown, Check, LoaderCircle, Wrench } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import CopyButton from '../../../components/ui/CopyButton';
import IconButton from '../../../components/ui/IconButton';
import type { ChatMessage } from '../lib/conversation';

const Markdown = lazy(() => import('../../../components/markdown/Markdown'));

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
                    <>
                      <div className="space-y-3">
                        {message.blocks.map((block, index) =>
                          block.type === 'text' ? (
                            <Suspense
                              key={index}
                              fallback={
                                <div className="text-message whitespace-pre-wrap [overflow-wrap:anywhere]">
                                  {block.text}
                                </div>
                              }
                            >
                              <Markdown
                                text={block.text}
                                streaming={block.streaming}
                              />
                            </Suspense>
                          ) : (
                            <div
                              key={block.id}
                              className="flex items-center gap-2 py-1 text-caption text-muted-foreground"
                            >
                              {block.status === 'running' ? (
                                <LoaderCircle
                                  size={13}
                                  className="animate-spin"
                                />
                              ) : block.status === 'done' ? (
                                <Check size={13} />
                              ) : (
                                <Wrench size={13} />
                              )}
                              <span>
                                {block.status === 'running'
                                  ? 'Running'
                                  : block.status === 'done'
                                    ? 'Used'
                                    : block.status === 'error'
                                      ? 'Failed'
                                      : 'Stopped'}{' '}
                                {block.name}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                      {!(busy && message === last) && (
                        <div className="mt-2 -ml-1.5">
                          <CopyButton
                            label="Copy response"
                            text={message.blocks
                              .map((block) =>
                                block.type === 'text' ? block.text : '',
                              )
                              .filter(Boolean)
                              .join('\n\n')}
                          />
                        </div>
                      )}
                    </>
                  )}
                </article>
              ))}
              {busy && (
                <div
                  className="flex items-center gap-2 text-caption text-muted-foreground"
                  role="status"
                >
                  <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                  {last?.role === 'assistant' ? 'Responding…' : 'Thinking…'}
                </div>
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
