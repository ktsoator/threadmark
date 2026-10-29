import { PanelLeftClose, Search, SquarePen } from 'lucide-react';
import Button from '../../../components/ui/Button';
import IconButton from '../../../components/ui/IconButton';
import { cn } from '../../../lib/cn';

type SidebarProps = {
  open: boolean;
  onClose: () => void;
  onNewChat: () => void;
  onSearch: () => void;
};

export default function Sidebar({
  open,
  onClose,
  onNewChat,
  onSearch,
}: SidebarProps) {
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
            className="h-navigation justify-start gap-2.5 rounded-navigation bg-hover px-2.5 text-foreground"
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

        <ul
          className="min-h-0 flex-1 overflow-y-auto px-2.5 py-4"
          aria-label="Conversations"
        />
      </div>
    </aside>
  );
}
