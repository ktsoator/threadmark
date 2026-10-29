import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import IconButton from './IconButton';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  closeLabel?: string;
  closeDisabled?: boolean;
  className?: string;
  onOpenAutoFocus?: ComponentProps<
    typeof DialogPrimitive.Content
  >['onOpenAutoFocus'];
  onCloseAutoFocus?: ComponentProps<
    typeof DialogPrimitive.Content
  >['onCloseAutoFocus'];
};

export default function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  closeLabel = 'Close dialog',
  closeDisabled = false,
  className,
  onOpenAutoFocus,
  onCloseAutoFocus,
}: DialogProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pointerInteractionRef = useRef(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-3rem)] w-dialog max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-dialog border border-border bg-background p-4 text-foreground outline-none',
            className,
          )}
          onOpenAutoFocus={(event) => {
            pointerInteractionRef.current = false;
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            onOpenAutoFocus?.(event);
          }}
          onCloseAutoFocus={(event) => {
            // Pointer dismissal should not leave a focus ring on the opener.
            if (pointerInteractionRef.current) {
              event.preventDefault();
              return;
            }
            onCloseAutoFocus?.(event);
            if (event.defaultPrevented) return;
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          onPointerDownCapture={() => {
            pointerInteractionRef.current = true;
          }}
          onPointerDownOutside={() => {
            pointerInteractionRef.current = true;
          }}
          onKeyDownCapture={() => {
            pointerInteractionRef.current = false;
          }}
          onEscapeKeyDown={() => {
            pointerInteractionRef.current = false;
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <DialogPrimitive.Title className="text-body font-medium tracking-[-0.2px]">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton label={closeLabel} disabled={closeDisabled}>
                <X size={16} />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
