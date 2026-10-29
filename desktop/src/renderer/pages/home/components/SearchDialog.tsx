import { MessageSquare, Search } from 'lucide-react';
import { useRef } from 'react';
import Dialog from '../../../components/ui/Dialog';

export default function SearchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const searchRef = useRef<HTMLInputElement>(null);

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
        />
      </div>
      <div className="px-2.5 pt-7 pb-5 text-center text-subtle-foreground">
        <MessageSquare
          size={23}
          strokeWidth={1.4}
          className="mx-auto"
          aria-hidden="true"
        />
        <p className="mt-3.25 mb-1.75 text-ui text-secondary-foreground">
          No conversations yet
        </p>
        <span className="text-caption">
          Your first conversation will appear here.
        </span>
      </div>
    </Dialog>
  );
}
