import { ChevronRight, FolderOpen, LoaderCircle } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { Project } from '../../../../shared/agent/types';
import { ServiceError } from '../../../../shared/agent/errors';
import Button from '../../../components/ui/Button';
import Dialog from '../../../components/ui/Dialog';
import {
  canSelectDirectory,
  selectProjectDirectory,
} from '../../../services/desktop';
import type { SessionLibrary } from '../hooks/useSessionLibrary';

export type ProjectAction =
  | { type: 'create' }
  | { type: 'rename' | 'delete'; project: Project };

export default function ProjectDialog({
  action,
  library,
  onClose,
  onReturnFocus,
}: {
  action: ProjectAction;
  library: SessionLibrary;
  onClose: () => void;
  onReturnFocus: () => void;
}) {
  const project = action.type === 'create' ? null : action.project;
  const [name, setName] = useState(project?.name ?? '');
  const [directory, setDirectory] = useState(project?.directory ?? '');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const pendingRef = useRef(false);
  const folderHintId = useId();
  const deleting = action.type === 'delete';
  const nonempty =
    deleting &&
    library.sessions.some((session) => session.projectId === project?.id);
  async function chooseFolder() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setChoosing(true);
    try {
      const path = await selectProjectDirectory();
      if (path) {
        setDirectory(path);
        setName(
          (value) =>
            value || path.split(/[\\/]/).filter(Boolean).at(-1) || 'Project',
        );
        setError('');
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Could not choose a folder.',
      );
    } finally {
      pendingRef.current = false;
      setChoosing(false);
    }
  }
  async function submit() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError('');
    try {
      if (action.type === 'create')
        await library.createProject({ name: name.trim(), directory });
      else if (action.type === 'rename')
        await library.renameProject(action.project.id, name.trim());
      else await library.deleteProject(action.project.id);
      onClose();
    } catch (error) {
      if (
        error instanceof ServiceError &&
        error.code === 'PROJECT_EXISTS' &&
        typeof error.details?.projectId === 'string'
      ) {
        await library.refresh();
        library.newChat(error.details.projectId);
        onClose();
      } else
        setError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog
      open
      className="p-5 small:p-6"
      title={
        deleting
          ? 'Remove project?'
          : project
            ? 'Rename project'
            : 'Add project'
      }
      description={
        deleting
          ? 'Remove the project from your sidebar. Your files will be kept.'
          : 'Choose a folder for the conversations in this project.'
      }
      closeDisabled={pending || choosing}
      onOpenChange={(open) => {
        if (!open && !pendingRef.current) onClose();
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
        className="grid gap-6 pt-2"
      >
        {deleting ? (
          <div className="space-y-2 text-body text-secondary-foreground">
            <p>
              Remove{' '}
              <span className="font-medium text-foreground">
                {project?.name}
              </span>{' '}
              from the sidebar? Your folder and files will be kept.
            </p>
            {nonempty && (
              <p role="status">
                Delete this project's conversations before removing it.
              </p>
            )}
          </div>
        ) : (
          <div className="grid gap-6">
            <label className="grid gap-2 text-ui text-secondary-foreground">
              <span>Project name</span>
              <input
                autoFocus
                className="h-10 w-full rounded-control border border-input-border bg-background px-3 text-body text-foreground outline-none focus:border-focus-border"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
                disabled={pending || choosing}
                placeholder="Project name"
              />
            </label>
            <div className="grid gap-2">
              <span className="text-ui text-secondary-foreground">
                Working folder
              </span>
              {action.type === 'create' ? (
                <Button
                  onClick={() => {
                    void chooseFolder();
                  }}
                  disabled={!canSelectDirectory() || pending || choosing}
                  aria-label={directory ? 'Change folder' : 'Choose folder'}
                  aria-describedby={folderHintId}
                  className="h-auto min-h-10 w-full justify-start gap-2.5 rounded-control border border-input-border bg-sidebar px-3 py-2 text-left text-body text-secondary-foreground enabled:hover:border-focus-border enabled:hover:bg-surface-subtle disabled:opacity-60"
                >
                  {choosing ? (
                    <LoaderCircle size={16} className="shrink-0 animate-spin" />
                  ) : (
                    <FolderOpen size={16} className="shrink-0" />
                  )}
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    {directory || 'Choose folder'}
                  </span>
                  {directory ? (
                    <span className="text-caption text-accent">Change</span>
                  ) : (
                    <ChevronRight
                      size={16}
                      className="shrink-0 text-muted-foreground"
                    />
                  )}
                </Button>
              ) : (
                <div className="flex min-h-10 items-center gap-2.5 rounded-control border border-border bg-sidebar px-3 py-2 text-body text-secondary-foreground">
                  <FolderOpen size={16} className="shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {directory}
                  </span>
                </div>
              )}
              <p
                id={folderHintId}
                className="text-caption leading-5 text-muted-foreground"
              >
                {action.type === 'create' && !canSelectDirectory()
                  ? 'Folder selection is available in the desktop app.'
                  : 'Conversations in this project share this folder.'}
              </p>
            </div>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="text-body text-error [overflow-wrap:anywhere]"
          >
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            className="h-9 px-4"
            onClick={onClose}
            disabled={pending || choosing}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant={deleting ? 'danger' : 'primary'}
            className="h-9 px-4"
            disabled={
              pending ||
              choosing ||
              !!nonempty ||
              (!deleting && (!name.trim() || !directory))
            }
          >
            {pending && <LoaderCircle size={14} className="animate-spin" />}
            {deleting ? 'Remove project' : project ? 'Save' : 'Add project'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
