import {
  BookOpen,
  ChevronRight,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import type { SkillSummary } from '../../../shared/agent/types';
import Button from '../../components/ui/Button';
import IconButton from '../../components/ui/IconButton';
import { cn } from '../../lib/cn';
import { listSkills } from '../../services/agent';
import SkillDetailDialog from './SkillDetailDialog';

function SkillItem({
  skill,
  onOpen,
}: {
  skill: SkillSummary;
  onOpen: (trigger: HTMLButtonElement) => void;
}) {
  const descriptionId = useId();

  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-label={skill.name}
        aria-haspopup="dialog"
        aria-describedby={descriptionId}
        onClick={(event) => onOpen(event.currentTarget)}
        className="group flex w-full items-start gap-3 rounded-dialog border border-border/70 bg-surface-subtle/60 p-4 text-left transition-colors duration-150 hover:border-input-border hover:bg-sidebar"
      >
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-navigation border border-border/70 bg-background text-secondary-foreground">
          <FileText size={16} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-message leading-5 font-medium text-foreground [overflow-wrap:anywhere]">
              {skill.name}
            </span>
            <ChevronRight
              size={13}
              aria-hidden="true"
              className="shrink-0 text-subtle-foreground group-hover:text-foreground"
            />
          </span>
          <span
            id={descriptionId}
            className="mt-1 line-clamp-2 min-h-10 text-body text-muted-foreground [overflow-wrap:anywhere]"
          >
            {skill.description}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function SkillsPage() {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [query, setQuery] = useState('');
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
    void listSkills()
      .then((items) => {
        if (current) setSkills(items);
      })
      .catch((error: unknown) => {
        if (!current) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Could not load skills. Please try again.';
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
  }, [revision]);

  const search = query.trim().toLocaleLowerCase();
  const filtered = skills.filter((skill) =>
    `${skill.name}\n${skill.description}`.toLocaleLowerCase().includes(search),
  );
  const refresh = () => setRevision((value) => value + 1);

  return (
    <>
      <section
        className="min-h-0 flex-1 overflow-y-auto px-5 py-7 desktop:px-10 desktop:py-12"
        aria-labelledby="skills-heading"
      >
        <div className="@container mx-auto w-full max-w-[52rem]">
          <div className="flex flex-col gap-5 @min-[36rem]:flex-row @min-[36rem]:items-center @min-[36rem]:justify-between">
            <div className="flex items-center gap-2.5">
              <h1
                id="skills-heading"
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-title-small font-medium tracking-[-0.5px] outline-none"
              >
                Skills
              </h1>
              {!loading && !error && (
                <span
                  className="text-ui text-subtle-foreground"
                  aria-hidden="true"
                >
                  {search
                    ? `${filtered.length} / ${skills.length}`
                    : skills.length}
                </span>
              )}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-navigation bg-sidebar px-3 text-muted-foreground focus-within:outline-2 focus-within:outline-accent/30 @min-[36rem]:w-56">
                <Search size={14} className="shrink-0" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Search skills"
                  placeholder="Search skills…"
                  className="w-full min-w-0 border-0 bg-transparent p-0 text-ui text-foreground outline-none placeholder:text-placeholder focus-visible:outline-none"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <IconButton
                label="Refresh skills"
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
          </div>

          {loading ? (
            <div
              className="flex items-center justify-center gap-2 py-16 text-ui text-muted-foreground"
              role="status"
            >
              <LoaderCircle
                size={16}
                className="animate-spin"
                aria-hidden="true"
              />
              Loading skills…
            </div>
          ) : error ? (
            <div className="px-2 py-12 text-center" role="alert">
              <p className="text-body text-foreground">Skills unavailable</p>
              <p className="mt-2 text-ui leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                {error}
              </p>
              <Button className="mt-3" onClick={refresh}>
                Try again
              </Button>
            </div>
          ) : skills.length === 0 ? (
            <div className="px-2 py-16 text-center" role="status">
              <BookOpen
                size={25}
                strokeWidth={1.4}
                className="mx-auto text-subtle-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 text-body text-secondary-foreground">
                No skills available
              </p>
              <p className="mt-2 text-ui leading-5 text-muted-foreground">
                Add a skill to your project or user skills folder, then refresh.
              </p>
            </div>
          ) : (
            <>
              <p className="sr-only" role="status">
                {search
                  ? `${filtered.length} of ${skills.length} skills`
                  : `${skills.length} ${skills.length === 1 ? 'skill' : 'skills'} available`}
              </p>
              {filtered.length > 0 ? (
                <ul
                  className="mt-6 grid items-start gap-3 @min-[36rem]:grid-cols-2"
                  aria-label="Available skills"
                >
                  {filtered.map((skill) => (
                    <SkillItem
                      key={skill.name}
                      skill={skill}
                      onOpen={(trigger) => {
                        returnFocusRef.current = trigger;
                        setSelectedName(skill.name);
                      }}
                    />
                  ))}
                </ul>
              ) : (
                <div className="py-12 text-center" role="status">
                  <p className="text-body text-secondary-foreground">
                    No matching skills
                  </p>
                  <p className="mt-2 text-ui text-muted-foreground">
                    Try a different name or description.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>
      {selectedName !== null && (
        <SkillDetailDialog
          key={selectedName}
          name={selectedName}
          onClose={() => setSelectedName(null)}
          onReturnFocus={() => {
            (returnFocusRef.current ?? headingRef.current)?.focus({
              preventScroll: true,
            });
          }}
        />
      )}
    </>
  );
}
