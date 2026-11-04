import { LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import type { AgentSession } from '../../../../shared/agent/types';
import Button from '../../../components/ui/Button';
import Dialog from '../../../components/ui/Dialog';
import { sessionTitle } from '../lib/conversation';

export type ConversationAction = {
  type: 'rename' | 'delete';
  session: AgentSession;
};

export default function ConversationActionDialog({
  action,
  onClose,
  onRename,
  onDelete,
  onReturnFocus,
}: {
  action: ConversationAction;
  onClose: () => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string, cleanup: boolean) => Promise<void>;
  onReturnFocus: () => void;
}) {
  const renaming = action.type === 'rename';
  const originalTitle = sessionTitle(action.session);
  const [title, setTitle] = useState(originalTitle);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [cleanup, setCleanup] = useState(false);
  const pendingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const canSubmit =
    !renaming || (!!title.trim() && title.trim() !== originalTitle);

  async function submit() {
    if (pendingRef.current || !canSubmit) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      if (renaming) await onRename(action.session.id, title.trim());
      else await onDelete(action.session.id, cleanup);
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pendingRef.current) onClose();
      }}
      title={renaming ? 'Rename conversation' : 'Delete conversation?'}
      description={
        renaming
          ? 'Choose a name for this conversation.'
          : 'Permanently delete this conversation and its messages.'
      }
      closeDisabled={pending}
      className="w-96"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        if (renaming) {
          inputRef.current?.focus();
          inputRef.current?.select();
        } else cancelRef.current?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onReturnFocus();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        aria-busy={pending}
      >
        {renaming ? (
          <>
            <label htmlFor="conversation-name" className="sr-only">
              Conversation name
            </label>
            <input
              ref={inputRef}
              id="conversation-name"
              className="h-9 w-full rounded-control border border-input-border bg-background px-2.5 text-body text-foreground outline-none focus:border-focus-border focus-visible:outline-offset-2 disabled:opacity-60"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
              disabled={pending}
              required
            />
          </>
        ) : (
          <p className="text-ui leading-relaxed text-secondary-foreground [overflow-wrap:anywhere]">
            <span className="font-medium text-foreground">
              “{originalTitle}”
            </span>{' '}
            and its messages will be permanently deleted.
          </p>
        )}
        {!renaming && action.session.managedDirectory && (
          <div className="mt-4 space-y-2 rounded-navigation border border-border bg-sidebar p-3">
            <label className="flex items-center gap-2 text-ui text-foreground">
              <input
                type="checkbox"
                className="accent-accent"
                checked={cleanup}
                onChange={(event) => setCleanup(event.target.checked)}
                disabled={pending}
              />
              Delete workspace files
            </label>
            <p className="text-caption text-muted-foreground [overflow-wrap:anywhere]">
              {action.session.managedDirectory}
            </p>
            <p className="text-caption text-muted-foreground">
              {cleanup
                ? 'All files in this folder will be permanently deleted.'
                : 'Keep this folder and its files.'}
            </p>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="mt-3 text-ui leading-relaxed text-error [overflow-wrap:anywhere]"
          >
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={renaming ? 'primary' : 'danger'}
            disabled={pending || !canSubmit}
          >
            {pending && (
              <LoaderCircle
                size={14}
                className="animate-spin"
                aria-hidden="true"
              />
            )}
            {pending
              ? renaming
                ? 'Saving…'
                : 'Deleting…'
              : renaming
                ? 'Save'
                : 'Delete'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
