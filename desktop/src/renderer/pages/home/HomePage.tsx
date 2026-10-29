import { PanelLeftOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import IconButton from '../../components/ui/IconButton';
import { cn } from '../../lib/cn';
import PromptComposer from './components/PromptComposer';
import SearchDialog from './components/SearchDialog';
import Sidebar from './components/Sidebar';

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
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [notice, setNotice] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const breakpoint = getDesktopMediaQuery();
    const handleChange = (event: MediaQueryListEvent) => {
      setSidebarOpen(event.matches);
    };
    breakpoint.addEventListener('change', handleChange);
    return () => breakpoint.removeEventListener('change', handleChange);
  }, []);

  const focusComposer = () => inputRef.current?.focus();

  const startNewChat = () => {
    setDraft('');
    setAttachments([]);
    setNotice('');
    if (!getDesktopMediaQuery().matches) {
      setSidebarOpen(false);
    }
    focusComposer();
  };

  const addAttachments = (files: File[]) => {
    setAttachments((current) => {
      const unique = new Map(
        [...current, ...files].map((file) => [
          `${file.name}-${file.size}-${file.lastModified}`,
          file,
        ]),
      );
      return [...unique.values()];
    });
    setNotice('');
    focusComposer();
  };

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
        className="relative flex min-w-0 flex-col overflow-auto"
        id="main-content"
      >
        {!sidebarOpen && (
          <IconButton
            className="absolute top-4 left-4"
            label="Open sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeftOpen size={16} />
          </IconButton>
        )}

        <div className="flex flex-1 items-center justify-center px-4 pt-9 pb-22.5 small:px-5.5 desktop:px-7 desktop:pt-10 desktop:pb-27 wide:px-10">
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

            <PromptComposer
              inputRef={inputRef}
              value={draft}
              attachments={attachments}
              onChange={(value) => {
                setDraft(value);
                setNotice('');
              }}
              onAttach={addAttachments}
              onRemoveAttachment={(file) => {
                setAttachments((current) =>
                  current.filter((attachment) => attachment !== file),
                );
              }}
              onSubmit={() => {
                setNotice('Connect an agent to send your message.');
                focusComposer();
              }}
            />

            <div
              className="min-h-6 px-4 pt-1.5 text-caption text-muted-foreground"
              role="status"
            >
              {notice}
            </div>
          </section>
        </div>
      </main>

      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
