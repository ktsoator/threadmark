import {
  BookOpen,
  MessageSquare,
  MessagesSquare,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  SquarePen,
} from 'lucide-react';
import { useRef, useState } from 'react';
import Button from '../../../components/ui/Button';
import IconButton from '../../../components/ui/IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/DropdownMenu';
import { cn } from '../../../lib/cn';
import type { SessionLibrary } from '../hooks/useSessionLibrary';
import ConversationActionDialog, {
  type ConversationAction,
} from './ConversationActionDialog';
import ConversationItem from './ConversationItem';
import ProjectDialog, { type ProjectAction } from './ProjectDialog';
import ProjectSection from './ProjectSection';
import SidebarGroup from './SidebarGroup';

export default function Sidebar({
  open,
  onClose,
  onSearch,
  library,
  onSelect,
  onNew,
  onDelete,
  onSkills,
}: {
  open: boolean;
  onClose: () => void;
  onSearch: () => void;
  library: SessionLibrary;
  onSelect: (id: string) => void;
  onNew: SessionLibrary['newChat'];
  onDelete: (id: string, cleanup: boolean) => Promise<void>;
  onSkills: () => void;
}) {
  const [action, setAction] = useState<ConversationAction | null>(null);
  const [projectAction, setProjectAction] = useState<ProjectAction | null>(
    null,
  );
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const newChat = useRef<HTMLButtonElement>(null);
  const standalone = library.sessions.filter((session) => !session.projectId);
  const activeId =
    library.selection.page === 'chat' ? library.target.sessionId : null;
  const restoreFocus = () => {
    (actionTrigger.current?.isConnected
      ? actionTrigger.current
      : newChat.current
    )?.focus();
  };
  const openAction = (
    action: ConversationAction,
    trigger: HTMLButtonElement | null,
  ) => {
    actionTrigger.current = trigger;
    setAction(action);
  };
  const openProjectAction = (
    action: ProjectAction,
    trigger: HTMLButtonElement | null,
  ) => {
    actionTrigger.current = trigger;
    setProjectAction(action);
  };
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-20 flex w-(--sidebar-width) min-w-0 flex-col overflow-hidden border-r border-border bg-sidebar transition-[transform,visibility] duration-180 desktop:static desktop:z-auto desktop:w-auto',
        !open && 'invisible -translate-x-full desktop:translate-x-0',
      )}
      aria-label="Sidebar"
      inert={!open}
    >
      <div className="flex h-full w-[calc(var(--sidebar-width)-1px)] flex-col">
        <div className="flex h-sidebar-header shrink-0 items-center justify-between pr-3 pl-4.5">
          <a
            className="text-base font-semibold tracking-[-0.5px] text-foreground no-underline wide:text-brand"
            href="#main-content"
          >
            Threadmark
          </a>
          <IconButton label="Close sidebar" onClick={onClose}>
            <PanelLeftClose size={16} />
          </IconButton>
        </div>
        <nav className="grid gap-0.75 px-2.5" aria-label="Main navigation">
          <Button
            ref={newChat}
            className="h-navigation justify-start gap-2.5 px-2.5 text-foreground"
            onClick={() => onNew(library.target.projectId, 'chat')}
          >
            <SquarePen size={16} />
            New chat
          </Button>
          <Button
            className="h-navigation justify-start gap-2.5 px-2.5 text-foreground"
            onClick={() => onNew(library.target.projectId, 'freechat')}
          >
            <MessagesSquare size={16} />
            New free chat
          </Button>
          <Button
            className="h-navigation justify-start gap-2.5 px-2.5 text-foreground"
            onClick={onSearch}
          >
            <Search size={16} />
            Search chats
          </Button>
          <Button
            className={cn(
              'h-navigation justify-start gap-2.5 px-2.5 text-foreground',
              library.selection.page === 'skills' && 'bg-hover',
            )}
            onClick={onSkills}
            aria-current={
              library.selection.page === 'skills' ? 'page' : undefined
            }
          >
            <BookOpen size={16} />
            Skills
          </Button>
        </nav>
        {library.error && (
          <div
            role="status"
            className="mx-3 mt-3 flex items-start gap-1 text-caption text-error"
          >
            <span className="min-w-0 flex-1 pt-1 [overflow-wrap:anywhere]">
              {library.error}
            </span>
            <IconButton
              label="Reload conversations"
              onClick={() => {
                void library.refresh();
              }}
            >
              <RefreshCw size={14} />
            </IconButton>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
          <SidebarGroup
            label="Projects"
            action={
              <IconButton
                className="size-6"
                label="Add project"
                disabled={!library.ready}
                onClick={(event) =>
                  openProjectAction({ type: 'create' }, event.currentTarget)
                }
              >
                <Plus size={16} strokeWidth={1.5} />
              </IconButton>
            }
          >
            <ul className="space-y-1" aria-label="Projects">
              {library.projects.map((project) => (
                <ProjectSection
                  key={project.id}
                  project={project}
                  sessions={library.sessions.filter(
                    (session) => session.projectId === project.id,
                  )}
                  expanded={library.expanded.includes(project.id)}
                  selected={library.target.projectId === project.id}
                  activeId={activeId}
                  onToggle={() => library.toggleProject(project.id)}
                  onNew={(kind) => onNew(project.id, kind)}
                  onSelect={onSelect}
                  onAction={openAction}
                  onProjectAction={openProjectAction}
                />
              ))}
            </ul>
            {!library.projects.length && library.ready && (
              <p className="px-2.5 py-2 text-caption leading-5 text-muted-foreground">
                Add a folder to keep related conversations together.
              </p>
            )}
          </SidebarGroup>
          <SidebarGroup
            label="Chats"
            action={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    className="size-6"
                    label="New standalone conversation"
                  >
                    <Plus size={16} strokeWidth={1.5} />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onSelect={() => onNew(null, 'chat')}>
                    <MessageSquare />
                    New chat
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onNew(null, 'freechat')}>
                    <MessagesSquare />
                    New free chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            <ul className="space-y-0.5" aria-label="Standalone conversations">
              {standalone.map((session) => (
                <ConversationItem
                  key={session.id}
                  session={session}
                  active={session.id === activeId}
                  onSelect={onSelect}
                  onAction={openAction}
                />
              ))}
            </ul>
            {!standalone.length && library.ready && (
              <p className="px-2.5 py-2 text-caption text-muted-foreground">
                Your independent chats appear here.
              </p>
            )}
          </SidebarGroup>
        </div>
      </div>
      {action && (
        <ConversationActionDialog
          key={`${action.type}-${action.session.id}`}
          action={action}
          onClose={() => setAction(null)}
          onRename={library.renameSession}
          onDelete={onDelete}
          onReturnFocus={restoreFocus}
        />
      )}
      {projectAction && (
        <ProjectDialog
          action={projectAction}
          library={library}
          onClose={() => setProjectAction(null)}
          onReturnFocus={restoreFocus}
        />
      )}
    </aside>
  );
}
