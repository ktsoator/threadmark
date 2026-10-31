import { ArrowDown } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import CopyButton from '../../../components/ui/CopyButton';
import IconButton from '../../../components/ui/IconButton';
import { type ChatMessage, messageSections } from '../lib/conversation';
import WorkBlock from './WorkBlock';

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
  const lastSection = messageSections(last?.blocks ?? []).at(-1);
  const working =
    last?.role === 'assistant' &&
    lastSection?.type === 'activity' &&
    (lastSection.blocks.length > 1 ||
      lastSection.blocks.some((block) =>
        block.type === 'thought' ? block.streaming : block.status === 'running',
      ));
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
      if (!scroll) return;
      if (following.current) scroll.scrollTop = scroll.scrollHeight;
      setShowScroll(
        scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight >= 80,
      );
    });
    if (contentRef.current) observer.observe(contentRef.current);
    if (scrollRef.current) observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto px-4 [overflow-anchor:none] [scrollbar-gutter:stable] desktop:px-8"
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
                      <div className="space-y-4">
                        {messageSections(message.blocks).map(
                          (section, index, sections) =>
                            section.type === 'text' ? (
                              <Suspense
                                key={section.index}
                                fallback={
                                  <div className="text-message whitespace-pre-wrap [overflow-wrap:anywhere]">
                                    {section.block.text}
                                  </div>
                                }
                              >
                                <Markdown
                                  text={section.block.text}
                                  streaming={section.block.streaming}
                                />
                              </Suspense>
                            ) : (
                              <WorkBlock
                                key={section.index}
                                blocks={section.blocks}
                                onToggle={() => {
                                  // Keep the clicked heading in place as its content expands.
                                  following.current = false;
                                }}
                                active={
                                  busy &&
                                  message === last &&
                                  index === sections.length - 1
                                }
                              />
                            ),
                        )}
                      </div>
                      {!(busy && message === last) &&
                        message.blocks.some(
                          (block) => block.type === 'text' && block.text,
                        ) && (
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
              {busy && !working && (
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
