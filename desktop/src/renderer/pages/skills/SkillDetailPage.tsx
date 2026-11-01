import { ArrowLeft, LoaderCircle, RefreshCw } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { SkillDetail } from '../../../shared/agent/types';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import { cn } from '../../lib/cn';
import { getSkill } from '../../services/agent';

const Markdown = lazy(() => import('../../components/markdown/Markdown'));

export default function SkillDetailPage({
  name,
  onBack,
}: {
  name: string;
  onBack: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    void getSkill(name)
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
  }, [name, revision]);

  const refresh = () => setRevision((value) => value + 1);

  return (
    <section
      className="min-h-0 flex-1 overflow-y-auto px-5 py-7 desktop:px-10 desktop:py-12"
      aria-labelledby="skill-detail-heading"
    >
      <div className="mx-auto w-full max-w-reading">
        <div className="mb-7 flex items-center justify-between">
          <Button
            className="-ml-2 gap-1.5 px-2"
            aria-label="Back to skills"
            onClick={onBack}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Skills
          </Button>
          <IconButton
            label="Refresh skill"
            size="md"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw
              size={15}
              aria-hidden="true"
              className={cn(loading && 'animate-spin')}
            />
          </IconButton>
        </div>
        <h1
          id="skill-detail-heading"
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-title-small font-medium tracking-[-0.5px] outline-none [overflow-wrap:anywhere]"
        >
          {name}
        </h1>

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
            <Button className="mt-3 -ml-3" onClick={refresh}>
              Try again
            </Button>
          </div>
        ) : skill ? (
          <>
            <p className="mt-3 text-body whitespace-pre-line text-muted-foreground [overflow-wrap:anywhere]">
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
    </section>
  );
}
