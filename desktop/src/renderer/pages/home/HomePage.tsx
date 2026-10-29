import { PanelLeftOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import IconButton from '../../components/ui/IconButton';
import { cn } from '../../lib/cn';
import MessageList from './components/MessageList';
import PromptComposer from './components/PromptComposer';
import SearchDialog from './components/SearchDialog';
import Sidebar from './components/Sidebar';
import useConversation from './hooks/useConversation';

function getDesktopMediaQuery() {
  const breakpoint = getComputedStyle(document.documentElement)
    .getPropertyValue('--breakpoint-desktop')
    .trim();
  return window.matchMedia(`(min-width: ${breakpoint})`);
}

export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(
    () => getDesktopMediaQuery().matches,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chat = useConversation();
  const hasConversation =
    !!chat.activeId || chat.messages.length > 0 || chat.loading;

  useEffect(() => {
    const breakpoint = getDesktopMediaQuery();
    const handleChange = (event: MediaQueryListEvent) =>
      setSidebarOpen(event.matches);
    breakpoint.addEventListener('change', handleChange);
    return () => breakpoint.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [hasConversation]);

  function closeMobileSidebar() {
    if (!getDesktopMediaQuery().matches) setSidebarOpen(false);
  }

  function startNewChat() {
    chat.newChat();
    closeMobileSidebar();
    inputRef.current?.focus();
  }

  function selectSession(id: string) {
    void chat.selectSession(id);
    closeMobileSidebar();
  }

  const composer = (
    <PromptComposer
      inputRef={inputRef}
      value={chat.draft}
      onChange={chat.setDraft}
      onSubmit={() => {
        void chat.send();
        inputRef.current?.focus();
      }}
      onStop={chat.stop}
      busy={chat.busy}
      disabled={chat.loading}
    />
  );
  const notice = (
    <div
      className="min-h-6 px-2 pt-1.5 text-caption text-error [overflow-wrap:anywhere]"
      role="alert"
    >
      {chat.error}
    </div>
  );

  return (
    <div
      className={cn(
        'grid h-full min-h-120 grid-cols-[minmax(0,1fr)] transition-[grid-template-columns] duration-180 ease-in-out [--sidebar-width:var(--spacing-sidebar)] desktop:[--sidebar-width:var(--spacing-sidebar-compact)] wide:[--sidebar-width:var(--spacing-sidebar)]',
        sidebarOpen
          ? 'desktop:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]'
          : 'desktop:grid-cols-[0_minmax(0,1fr)]',
      )}
    >
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNewChat={startNewChat}
        onSearch={() => setSearchOpen(true)}
        sessions={chat.sessions}
        activeId={chat.activeId}
        onSelect={selectSession}
        onRename={chat.renameSession}
        onDelete={chat.deleteSession}
        historyError={chat.historyError}
        onRetry={() => {
          void chat.refreshSessions();
        }}
      />
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-10 border-0 bg-overlay p-0 desktop:hidden"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          tabIndex={-1}
        />
      )}

      <main
        className="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
        id="main-content"
      >
        {!sidebarOpen && (
          <div
            className={
              hasConversation
                ? 'flex h-12 shrink-0 items-center px-4'
                : 'absolute top-4 left-4 z-10'
            }
          >
            <IconButton
              className="bg-background"
              label="Open sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <PanelLeftOpen size={16} />
            </IconButton>
          </div>
        )}

        {hasConversation ? (
          <>
            <MessageList
              key={chat.activeId || 'new'}
              messages={chat.messages}
              busy={chat.busy}
              loading={chat.loading}
            />
            <div className="shrink-0 bg-background px-4 pt-2 pb-3 desktop:px-8">
              <div className="mx-auto max-w-reading">
                {composer}
                {notice}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 pt-9 pb-22.5 small:px-5.5 desktop:px-7 desktop:pt-10 desktop:pb-27 wide:px-10">
            <section
              className="w-full max-w-composer"
              aria-labelledby="welcome-heading"
            >
              <h1
                className="mb-title-gap text-center font-display text-title-small font-medium tracking-[-0.6px] small:text-title-mobile desktop:text-title"
                id="welcome-heading"
              >
                What’s on your mind?
              </h1>
              {composer}
              {notice}
            </section>
          </div>
        )}
      </main>
      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        sessions={chat.sessions}
        onSelect={selectSession}
      />
    </div>
  );
}
