import { ArrowDown } from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import CopyButton from '../../../components/ui/CopyButton';
import IconButton from '../../../components/ui/IconButton';
import { type ChatMessage, messageContent } from '../lib/conversation';
import WorkBlock from './WorkBlock';

const Markdown = lazy(() => import('../../../components/markdown/Markdown'));

function AssistantMessage({
  message,
  active,
  onToggle,
}: {
  message: ChatMessage;
  active: boolean;
  onToggle: () => void;
}) {
  const { work, reply } = messageContent(message, active);
  return (
    <>
      <div className="space-y-4">
        {!!work.length && (
          <WorkBlock blocks={work} active={active} onToggle={onToggle} />
        )}
        {reply.map((block, index) => (
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
        ))}
      </div>
      {!!reply.length && (
        <div className="mt-2 -ml-1.5">
          <CopyButton
            label="Copy response"
            text={reply.map((block) => block.text).join('\n\n')}
          />
        </div>
      )}
    </>
  );
}

export default function MessageList({
  messages,
  busy,
  loading,
  renderUserMessage = (text) => text,
}: {
  messages: ChatMessage[];
  busy: boolean;
  loading: boolean;
  renderUserMessage?: (text: string) => ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showScroll, setShowScroll] = useState(false);
  const last = messages.at(-1);
  const working =
    last?.role === 'assistant' && messageContent(last, true).work.length > 0;
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
                      {renderUserMessage(
                        message.blocks
                          .map((block) =>
                            block.type === 'text' ? block.text : '',
                          )
                          .join(''),
                      )}
                    </div>
                  ) : (
                    <AssistantMessage
                      message={message}
                      active={busy && message === last}
                      onToggle={() => {
                        // Keep the clicked heading in place as its content expands.
                        following.current = false;
                      }}
                    />
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
