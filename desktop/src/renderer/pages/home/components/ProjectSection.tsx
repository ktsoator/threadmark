import {
  ChevronRight,
  Ellipsis,
  Folder,
  FolderOpen,
  MessageSquare,
  MessagesSquare,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useRef } from 'react';
import type {
  AgentSession,
  ChatKind,
  Project,
} from '../../../../shared/agent/types';
import Button from '../../../components/ui/Button';
import IconButton from '../../../components/ui/IconButton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/DropdownMenu';
import { cn } from '../../../lib/cn';
import ConversationItem from './ConversationItem';
import type { ConversationAction } from './ConversationActionDialog';
import type { ProjectAction } from './ProjectDialog';

export default function ProjectSection({
  project,
  sessions,
  expanded,
  selected,
  activeId,
  onToggle,
  onNew,
  onSelect,
  onAction,
  onProjectAction,
}: {
  project: Project;
  sessions: AgentSession[];
  expanded: boolean;
  selected: boolean;
  activeId: string | null;
  onToggle: () => void;
  onNew: (kind: ChatKind) => void;
  onSelect: (id: string) => void;
  onAction: (
    action: ConversationAction,
    trigger: HTMLButtonElement | null,
  ) => void;
  onProjectAction: (
    action: ProjectAction,
    trigger: HTMLButtonElement | null,
  ) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  const Icon = expanded ? FolderOpen : Folder;
  return (
    <li className="min-w-0">
      <div className="group flex min-w-0 items-center rounded-navigation hover:bg-hover">
        <Button
          className={cn(
            'min-w-0 flex-1 justify-start gap-2 px-2 text-secondary-foreground enabled:hover:bg-transparent',
            selected && 'text-foreground',
          )}
          aria-expanded={expanded}
          title={project.directory}
          onClick={onToggle}
        >
          <ChevronRight
            size={12}
            className={cn(
              'shrink-0 transition-transform',
              expanded && 'rotate-90',
            )}
          />
          <Icon
            size={15}
            className={cn('shrink-0', selected && 'text-accent')}
          />
          <span className="truncate font-medium">{project.name}</span>
          {!expanded && sessions.length > 0 && (
            <span className="ml-auto text-caption text-subtle-foreground">
              {sessions.length}
            </span>
          )}
        </Button>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton
              ref={trigger}
              label={`Project actions for ${project.name}`}
              className="mr-1 size-6 opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
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
            <DropdownMenuItem onSelect={() => onNew('chat')}>
              <MessageSquare />
              New chat
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNew('freechat')}>
              <MessagesSquare />
              New free chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                openingDialog.current = true;
                onProjectAction({ type: 'rename', project }, trigger.current);
              }}
            >
              <Pencil />
              Rename project
            </DropdownMenuItem>
            <DropdownMenuItem
              destructive
              onSelect={() => {
                openingDialog.current = true;
                onProjectAction({ type: 'delete', project }, trigger.current);
              }}
            >
              <Trash2 />
              Remove project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded && sessions.length > 0 && (
        <ul
          className="my-1 ml-4 space-y-0.5 border-l border-border pl-2"
          aria-label={`${project.name} conversations`}
        >
          {sessions.map((session) => (
            <ConversationItem
              key={session.id}
              session={session}
              active={session.id === activeId}
              onSelect={onSelect}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
