import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({
  className,
  align = 'start',
  sideOffset = 4,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'z-50 min-w-40 rounded-2xl border border-foreground/12 bg-background p-1 text-ui text-foreground shadow-[0_6px_18px_#0000000a] outline-none',
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex h-7.5 cursor-pointer items-center gap-2 rounded-xl px-2 text-ui leading-4 outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-hover [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:stroke-[1.75]',
        destructive && 'text-error data-highlighted:bg-error/8',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator() {
  return <MenuPrimitive.Separator className="mx-2 my-0.75 h-px bg-border" />;
}
