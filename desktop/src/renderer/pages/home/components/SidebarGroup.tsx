import { ChevronRight } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import Button from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';

export default function SidebarGroup({
  label,
  action,
  children,
}: {
  label: string;
  action: ReactNode;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const contentId = useId();
  return (
    <section className="mt-5">
      <div className="group/heading mb-1 flex h-8 items-center gap-1 pr-1.5 pl-2.5">
        <h2 className="min-w-0 flex-1">
          <Button
            className="h-7 w-full justify-start gap-1.5 px-0 text-ui font-medium text-muted-foreground enabled:hover:bg-transparent enabled:hover:text-secondary-foreground"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
          >
            {label}
            <ChevronRight
              size={12}
              strokeWidth={1.75}
              className={cn(
                'shrink-0 opacity-0 transition-[opacity,transform] duration-150 group-hover/heading:opacity-100 group-has-[:focus-visible]/heading:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100',
                expanded && 'rotate-90',
              )}
            />
          </Button>
        </h2>
        <div className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 group-hover/heading:opacity-100 group-has-[:focus-visible]/heading:opacity-100 has-[[data-state=open]]:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
          {action}
        </div>
      </div>
      <div id={contentId} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
