import { Ellipsis, Pencil, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import type { AgentSession } from '../../../../shared/agent/types';
import Button from '../../../components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/DropdownMenu';
import IconButton from '../../../components/ui/IconButton';
import { cn } from '../../../lib/cn';
import { sessionTitle } from '../lib/conversation';
import type { ConversationAction } from './ConversationActionDialog';

export default function ConversationItem({
  session,
  active,
  onSelect,
  onAction,
}: {
  session: AgentSession;
  active: boolean;
  onSelect: (id: string) => void;
  onAction: (
    action: ConversationAction,
    trigger: HTMLButtonElement | null,
  ) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  const title = sessionTitle(session);

  function openAction(type: ConversationAction['type']) {
    openingDialog.current = true;
    onAction({ type, session }, triggerRef.current);
  }

  return (
    <li
      className={cn(
        'group flex h-navigation items-center rounded-navigation hover:bg-hover has-[:focus-visible]:bg-hover has-[[data-state=open]]:bg-hover',
        active && 'bg-hover',
      )}
    >
      <Button
        className={cn(
          'h-full min-w-0 shrink flex-1 justify-start rounded-navigation px-2.5 text-ui text-secondary-foreground enabled:hover:bg-transparent',
          active && 'text-foreground',
        )}
        aria-current={active ? 'page' : undefined}
        onClick={() => onSelect(session.id)}
      >
        <span className="truncate">{title}</span>
      </Button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <IconButton
            ref={triggerRef}
            label={`Actions for ${title}`}
            title=""
            className={cn(
              'mr-1 size-6 opacity-0 enabled:hover:bg-transparent group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100',
              active && 'opacity-100',
            )}
          >
            <Ellipsis size={16} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          onCloseAutoFocus={(event) => {
            if (openingDialog.current) {
              event.preventDefault();
              openingDialog.current = false;
            }
          }}
        >
          <DropdownMenuItem onSelect={() => openAction('rename')}>
            <Pencil aria-hidden="true" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive onSelect={() => openAction('delete')}>
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
