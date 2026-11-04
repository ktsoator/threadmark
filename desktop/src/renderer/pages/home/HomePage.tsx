import { PanelLeftOpen, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatKind, SkillContext } from '../../../shared/agent/types';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import { cn } from '../../lib/cn';
import FreeChatPage from '../freechat/FreeChatPage';
import useFreeChat from '../freechat/hooks/useFreeChat';
import SkillsPage from '../skills/SkillsPage';
import MessageList from './components/MessageList';
import PromptComposer from './components/PromptComposer';
import SearchDialog from './components/SearchDialog';
import Sidebar from './components/Sidebar';
import useConversation from './hooks/useConversation';
import useSessionLibrary from './hooks/useSessionLibrary';
import { sessionTitle } from './lib/conversation';

function desktopMediaQuery() {
  return window.matchMedia(
    `(min-width: ${getComputedStyle(document.documentElement).getPropertyValue('--breakpoint-desktop').trim()})`,
  );
}

export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(
    () => desktopMediaQuery().matches,
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const library = useSessionLibrary();
  const chat = useConversation(library);
  const freeChat = useFreeChat(library);
  const { target, activeSession } = library;
  const skillsActive = library.selection.page === 'skills';
  const project = library.projects.find((item) => item.id === target.projectId);
  const hasConversation =
    !!target.sessionId || chat.messages.length > 0 || chat.loading;
  const context = useMemo<SkillContext | undefined>(
    () =>
      target.sessionId
        ? { sessionId: target.sessionId }
        : target.projectId
          ? { projectId: target.projectId }
          : undefined,
    [target.sessionId, target.projectId],
  );
  const contextLabel =
    project?.name ??
    (activeSession ? sessionTitle(activeSession) : 'User skills');
  useEffect(() => {
    const query = desktopMediaQuery();
    const change = (event: MediaQueryListEvent) =>
      setSidebarOpen(event.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!skillsActive && target.kind === 'chat') inputRef.current?.focus();
  }, [target.sessionId, target.projectId, target.kind, skillsActive]);
  function closeMobileSidebar() {
    if (!desktopMediaQuery().matches) setSidebarOpen(false);
  }
  function newChat(projectId: string | null = null, kind: ChatKind = 'chat') {
    library.newChat(projectId, kind);
    closeMobileSidebar();
    if (kind === 'chat') inputRef.current?.focus();
  }
  function selectSession(id: string) {
    library.selectSession(id);
    closeMobileSidebar();
  }
  async function deleteSession(id: string, cleanup: boolean) {
    chat.invalidate(id);
    freeChat.invalidate(id);
    try {
      await library.deleteSession(id, cleanup);
    } catch (error) {
      chat.reload(id);
      freeChat.reload(id);
      throw error;
    }
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
      disabled={!chat.ready || chat.loading}
    />
  );
  const notice = (
    <div
      className="min-h-6 px-2 pt-1.5 text-caption text-error [overflow-wrap:anywhere]"
      role="alert"
    >
      {chat.error}
      {chat.error && !chat.busy && (
        <Button
          className="ml-2 h-auto p-0 text-caption text-error underline"
          onClick={chat.retry}
        >
          Reload history
        </Button>
      )}
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
        onSearch={() => setSearchOpen(true)}
        library={library}
        onSelect={selectSession}
        onNew={newChat}
        onDelete={deleteSession}
        onSkills={() => {
          library.showSkills();
          closeMobileSidebar();
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
              hasConversation || skillsActive || target.kind === 'freechat'
                ? 'flex h-12 shrink-0 items-center px-4 desktop:absolute desktop:top-3 desktop:left-3 desktop:z-10 desktop:h-auto desktop:p-0'
                : 'absolute top-3 left-3 z-10'
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
        {library.notice && (
          <div
            role="status"
            className={cn(
              'flex items-start gap-2 border-b border-border bg-sidebar px-5 py-3 text-body text-secondary-foreground',
              !sidebarOpen && 'desktop:pl-14',
            )}
          >
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              {library.notice}
            </span>
            <IconButton
              label="Dismiss notification"
              onClick={() => library.setNotice('')}
            >
              <X size={14} />
            </IconButton>
          </div>
        )}
        {skillsActive ? (
          <SkillsPage
            key={context?.sessionId ?? context?.projectId ?? 'user'}
            context={context}
            contextLabel={contextLabel}
          />
        ) : target.kind === 'freechat' ? (
          <FreeChatPage chat={freeChat} />
        ) : hasConversation ? (
          <>
            <MessageList
              key={target.sessionId ?? 'new'}
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
              {project && (
                <p className="mb-4 text-center text-body text-muted-foreground">
                  Start a conversation in {project.name}.
                </p>
              )}
              {composer}
              {notice}
            </section>
          </div>
        )}
      </main>
      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        sessions={library.sessions}
        projects={library.projects}
        onSelect={selectSession}
      />
    </div>
  );
}
