import { lazy, Suspense, type ComponentProps } from 'react';
import { cn } from '../../lib/cn';

const Markdown = lazy(() => import('./Markdown'));

export default function LazyMarkdown(props: ComponentProps<typeof Markdown>) {
  return (
    <Suspense
      fallback={
        <div
          className={cn(
            'text-message whitespace-pre-wrap [overflow-wrap:anywhere]',
            props.className,
          )}
        >
          {props.text}
        </div>
      }
    >
      <Markdown {...props} />
    </Suspense>
  );
}
