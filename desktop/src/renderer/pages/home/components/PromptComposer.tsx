import { ArrowUp, Paperclip, Plus, X } from 'lucide-react';
import { useLayoutEffect, useRef, type RefObject } from 'react';
import IconButton from '../../../components/ui/IconButton';

type PromptComposerProps = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  attachments: File[];
  onChange: (value: string) => void;
  onAttach: (files: File[]) => void;
  onRemoveAttachment: (file: File) => void;
  onSubmit: () => void;
};

export default function PromptComposer({
  inputRef,
  value,
  attachments,
  onChange,
  onAttach,
  onRemoveAttachment,
  onSubmit,
}: PromptComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSend = value.trim().length > 0 || attachments.length > 0;

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
      {attachments.length > 0 && (
        <ul
          className="flex flex-wrap gap-1.75 px-2 pt-1 pb-2.5"
          aria-label="Attachments"
        >
          {attachments.map((file) => (
            <li
              className="flex min-w-0 max-w-55 items-center gap-1.5 rounded-lg border border-border bg-surface-subtle py-1.5 pr-1.75 pl-2.25 text-caption text-secondary-foreground"
              key={`${file.name}-${file.size}-${file.lastModified}`}
            >
              <Paperclip size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate" title={file.name}>
                {file.name}
              </span>
              <IconButton
                size="xs"
                label={`Remove ${file.name}`}
                onClick={() => onRemoveAttachment(file)}
              >
                <X size={13} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-1.5">
        <IconButton
          size="md"
          className="text-secondary-foreground"
          label="Attach files"
          onClick={() => fileInputRef.current?.click()}
        >
          <Plus size={19} strokeWidth={1.7} />
        </IconButton>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          onChange={(event) => {
            onAttach(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
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
      </div>
    </form>
  );
}
