import { LoaderCircle } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { SkillDetail, SkillContext } from '../../../shared/agent/types';
import Button from '../../components/ui/Button';
import Dialog from '../../components/ui/Dialog';
import { getSkill } from '../../services/agent';

const Markdown = lazy(() => import('../../components/markdown/Markdown'));

export default function SkillDetailDialog({
  name,
  context,
  onClose,
  onReturnFocus,
}: {
  name: string;
  context?: SkillContext;
  onClose: () => void;
  onReturnFocus: () => void;
}) {
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    void getSkill(name, context)
      .then((item) => {
        if (current) setSkill(item);
      })
      .catch((error: unknown) => {
        if (!current) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Could not load this skill. Please try again.';
        setError(
          message.replace(/^Error invoking remote method '[^']+': Error: /, ''),
        );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [name, context, revision]);

  const retry = () => setRevision((value) => value + 1);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={name}
      description="Skill description and instructions."
      closeLabel="Close skill details"
      className="w-[52rem] p-6"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        onReturnFocus();
      }}
    >
      <div className="min-w-0">
        {loading ? (
          <div
            className="flex items-center gap-2 py-10 text-ui text-muted-foreground"
            role="status"
          >
            <LoaderCircle
              size={16}
              className="animate-spin"
              aria-hidden="true"
            />
            Loading skill…
          </div>
        ) : error ? (
          <div className="py-8" role="alert">
            <p className="text-body text-foreground">Skill unavailable</p>
            <p className="mt-2 text-body text-muted-foreground [overflow-wrap:anywhere]">
              {error}
            </p>
            <Button className="mt-3 -ml-3" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : skill ? (
          <>
            <p className="text-body whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">
              {skill.description}
            </p>
            <div className="mt-7 border-t border-border pt-7 pb-6">
              {skill.instructions.trim() ? (
                <Suspense
                  fallback={
                    <p
                      className="text-body text-muted-foreground"
                      role="status"
                    >
                      Loading content…
                    </p>
                  }
                >
                  <Markdown text={skill.instructions} />
                </Suspense>
              ) : (
                <p className="text-body text-muted-foreground">
                  This skill has no instructions.
                </p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
