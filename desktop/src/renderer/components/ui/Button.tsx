import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

const variants = {
  ghost:
    'bg-transparent text-muted-foreground enabled:hover:bg-hover enabled:hover:text-foreground',
  primary:
    'bg-accent text-white enabled:hover:bg-accent-hover disabled:bg-accent-soft disabled:text-accent-muted',
};

const sizes = {
  default: 'h-control rounded-control px-3 text-ui',
  icon: 'size-control rounded-full p-0',
  'icon-sm': 'size-control-sm rounded-control p-0',
  'icon-xs': 'size-control-xs rounded p-0',
};

export type ButtonProps = ComponentProps<'button'> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export default function Button({
  className,
  variant = 'ghost',
  size = 'default',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 border-0 font-normal transition-colors duration-150 disabled:cursor-default',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
