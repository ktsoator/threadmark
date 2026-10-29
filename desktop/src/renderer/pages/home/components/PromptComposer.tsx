import { ArrowUp, Plus, Square } from 'lucide-react';
import { useLayoutEffect, type RefObject } from 'react';
import IconButton from '../../../components/ui/IconButton';

type PromptComposerProps = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  busy: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
};

export default function PromptComposer({
  inputRef,
  value,
  busy,
  disabled,
  onChange,
  onSubmit,
  onStop,
}: PromptComposerProps) {
  const canSend = value.trim().length > 0 && !busy && !disabled;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    }
  }, [value, inputRef]);

  return (
    <form
      className="rounded-composer border border-input-border bg-background p-1.75 transition-colors duration-150 focus-within:border-focus-border"
      aria-label="Message composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <div className="flex items-end gap-1.5">
        <IconButton
          size="md"
          className="text-subtle-foreground"
          label="Attach files"
          title="File attachments are not available yet"
          disabled
        >
          <Plus size={19} strokeWidth={1.7} />
        </IconButton>
        <label className="sr-only" htmlFor="message-input">
          Message Threadmark
        </label>
        <textarea
          id="message-input"
          className="block max-h-40 min-h-control w-0 min-w-0 flex-1 resize-none border-0 bg-transparent py-1.5 text-body text-foreground outline-none placeholder:text-placeholder focus-visible:outline-none [scrollbar-width:thin]"
          ref={inputRef}
          value={value}
          rows={1}
          placeholder="Ask anything"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              if (canSend) onSubmit();
            }
          }}
        />
        {busy ? (
          <IconButton
            size="md"
            variant="primary"
            label="Stop generating"
            onClick={onStop}
          >
            <Square size={12} fill="currentColor" />
          </IconButton>
        ) : (
          <IconButton
            size="md"
            variant="primary"
            type="submit"
            disabled={!canSend}
            label="Send message"
            title={canSend ? 'Send message' : 'Write a message to get started'}
          >
            <ArrowUp size={17} strokeWidth={2} />
          </IconButton>
        )}
      </div>
    </form>
  );
}
