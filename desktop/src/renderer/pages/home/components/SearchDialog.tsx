import { MessageSquare, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AgentSession } from '../../../../shared/agent/types';
import Button from '../../../components/ui/Button';
import Dialog from '../../../components/ui/Dialog';
import { sessionTitle } from '../lib/conversation';

export default function SearchDialog({
  open,
  onClose,
  sessions,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  sessions: AgentSession[];
  onSelect: (id: string) => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const filtered = sessions.filter((session) =>
    sessionTitle(session)
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title="Search conversations"
      description="Search your conversation history."
      closeLabel="Close search"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        setQuery('');
        searchRef.current?.focus();
      }}
    >
      <div className="flex items-center gap-2.5 rounded-navigation border border-border px-2.5 py-2 text-muted-foreground focus-within:border-focus-border focus-within:outline-2 focus-within:outline-accent/10">
        <Search size={16} className="shrink-0" aria-hidden="true" />
        <input
          className="w-full min-w-0 border-0 bg-transparent p-0.5 text-ui text-inherit outline-none placeholder:text-muted-foreground focus-visible:outline-none"
          ref={searchRef}
          type="search"
          aria-label="Search conversations"
          placeholder="Search your conversations…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {filtered.length > 0 ? (
        <ul
          className="mt-3 max-h-72 space-y-0.5 overflow-y-auto"
          aria-label="Search results"
        >
          {filtered.map((session) => (
            <li key={session.id}>
              <Button
                className="w-full justify-start text-foreground"
                onClick={() => {
                  onSelect(session.id);
                  onClose();
                }}
              >
                <MessageSquare
                  size={14}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate">{sessionTitle(session)}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-2.5 pt-7 pb-5 text-center text-subtle-foreground">
          <MessageSquare
            size={23}
            strokeWidth={1.4}
            className="mx-auto"
            aria-hidden="true"
          />
          <p className="mt-3.25 mb-1.75 text-ui text-secondary-foreground">
            {sessions.length
              ? 'No matching conversations'
              : 'No conversations yet'}
          </p>
          <span className="text-caption">
            {sessions.length
              ? 'Try a different search.'
              : 'Your first conversation will appear here.'}
          </span>
        </div>
      )}
    </Dialog>
  );
}
