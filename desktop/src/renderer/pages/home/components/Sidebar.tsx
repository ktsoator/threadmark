import { PanelLeftClose, Search, SquarePen, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AgentSession } from '../../../../shared/agent/types';
import Button from '../../../components/ui/Button';
import IconButton from '../../../components/ui/IconButton';
import { cn } from '../../../lib/cn';
import ConversationActionDialog, {
  type ConversationAction,
} from './ConversationActionDialog';
import ConversationItem from './ConversationItem';

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSearch: () => void;
  sessions: AgentSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  historyError: string;
  onRetry: () => void;
};

export default function Sidebar({
  open,
  onClose,
  onNewChat,
  onSearch,
  sessions,
  activeId,
  onSelect,
  onRename,
  onDelete,
  historyError,
  onRetry,
}: SidebarProps) {
  const [action, setAction] = useState<ConversationAction | null>(null);
  const actionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const newChatRef = useRef<HTMLButtonElement>(null);

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
        <div className="flex h-sidebar-header shrink-0 items-center justify-between pr-3.25 pl-4.5 desktop:pr-2.5 desktop:pl-4 wide:pr-3.25 wide:pl-4.5">
          <a
            className="text-base font-semibold tracking-[-0.5px] text-foreground no-underline wide:text-brand"
            href="#main-content"
            aria-label="Threadmark home"
          >
            Threadmark
          </a>
          <IconButton label="Close sidebar" onClick={onClose}>
            <PanelLeftClose size={16} />
          </IconButton>
        </div>

        <nav className="grid gap-0.75 px-2.5" aria-label="Main navigation">
          <Button
            ref={newChatRef}
            className={cn(
              'h-navigation justify-start gap-2.5 rounded-navigation px-2.5 text-foreground',
              !activeId && 'bg-hover',
            )}
            onClick={onNewChat}
          >
            <SquarePen size={16} />
            <span>New chat</span>
          </Button>
          <Button
            className="h-navigation justify-start gap-2.5 rounded-navigation px-2.5 text-foreground"
            onClick={onSearch}
          >
            <Search size={16} />
            <span>Search chats</span>
          </Button>
        </nav>

        {historyError && (
          <div
            className="mx-3 mt-4 flex items-start gap-1 text-caption text-muted-foreground"
            role="status"
          >
            <span className="flex-1 pt-1">Could not load conversations.</span>
            <IconButton
              label="Reload conversations"
              title={historyError}
              onClick={onRetry}
            >
              <RefreshCw size={14} />
            </IconButton>
          </div>
        )}
        <ul
          className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2.5 py-4"
          aria-label="Conversations"
        >
          {sessions.map((session) => (
            <ConversationItem
              key={session.id}
              session={session}
              active={activeId === session.id}
              onSelect={onSelect}
              onAction={(next, trigger) => {
                actionTriggerRef.current = trigger;
                setAction(next);
              }}
            />
          ))}
        </ul>
      </div>
      {action && (
        <ConversationActionDialog
          key={`${action.type}-${action.session.id}`}
          action={action}
          onClose={() => setAction(null)}
          onRename={onRename}
          onDelete={onDelete}
          onReturnFocus={() => {
            const trigger = actionTriggerRef.current;
            if (trigger?.isConnected) trigger.focus();
            else newChatRef.current?.focus();
          }}
        />
      )}
    </aside>
  );
}
