import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/cn';
import PromptComposer from '../../home/components/PromptComposer';
import { mentionsModel } from '../lib/mention';
import { models } from '../lib/models';
import MentionEditor, { type MentionEditorHandle } from './MentionEditor';

type MentionRange = { start: number; end: number; query: string };

export default function FreeChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  const inputRef = useRef<MentionEditorHandle>(null);
  const dismissed = useRef<{ text: string; caret: number } | null>(null);
  const [mention, setMention] = useState<MentionRange | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const asking = mentionsModel(value);
  const options = models.filter((model) =>
    model.name.toLowerCase().startsWith(mention?.query ?? ''),
  );
  const activeModel = options[activeIndex] ?? options[0];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function updateMention(text: string, caret: number) {
    if (dismissed.current?.text === text && dismissed.current.caret === caret) {
      setMention(null);
      return;
    }
    dismissed.current = null;
    const match = text
      .slice(0, caret)
      .match(/(?:^|[\s（(，,。！!？?：:；;])@([a-z]*)$/i);
    const query = match?.[1].toLowerCase();
    if (
      query === undefined ||
      !models.some((model) => model.name.toLowerCase().startsWith(query))
    ) {
      setMention(null);
      return;
    }
    const suffix = text.slice(caret).match(/^[a-z]*/i)?.[0] ?? '';
    setMention({
      start: caret - query.length - 1,
      end: caret + suffix.length,
      query,
    });
  }

  function selectModel(model = activeModel) {
    if (!mention || !model) return;
    const token = `@${model.name} `;
    inputRef.current?.replace(mention.start, mention.end, token);
    setMention(null);
    setActiveIndex(0);
  }

  function submit() {
    if (!value.trim() || busy || disabled) return;
    setMention(null);
    onSubmit();
    inputRef.current?.focus();
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setMention(null);
      }}
    >
      {mention && (
        <div
          id="freechat-models"
          role="listbox"
          aria-label="Mention a model"
          className="absolute bottom-full left-0 z-20 mb-1 w-40 max-w-full rounded-2xl border border-foreground/12 bg-background p-1 text-ui shadow-[0_6px_18px_#0000000a]"
        >
          {options.map((model, index) => (
            <button
              key={model.id}
              id={`freechat-${model.id}`}
              type="button"
              role="option"
              aria-selected={model === activeModel}
              tabIndex={-1}
              className={cn(
                'flex h-7.5 w-full items-center gap-2 rounded-xl px-2 text-left text-ui leading-4 text-foreground',
                model === activeModel && 'bg-hover',
              )}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectModel(model)}
            >
              <img
                src={model.logo}
                alt=""
                className="size-4 shrink-0 object-contain"
              />
              <span>{model.name}</span>
            </button>
          ))}
        </div>
      )}
      <PromptComposer
        submitLabel={asking ? 'Ask AI' : 'Save thought'}
        leadingAction={null}
        editor={
          <MentionEditor
            ref={inputRef}
            value={value}
            suggestionsId={mention ? 'freechat-models' : undefined}
            activeSuggestionId={
              mention && activeModel ? `freechat-${activeModel.id}` : undefined
            }
            onSelectionChange={(text, selection) => {
              if (selection.anchor === selection.focus)
                updateMention(text, selection.focus);
              else setMention(null);
            }}
            onKeyDown={(event) => {
              if (
                !mention ||
                event.nativeEvent.isComposing ||
                event.keyCode === 229
              )
                return;
              if (
                (event.key === 'Enter' || event.key === 'Tab') &&
                !event.shiftKey
              ) {
                event.preventDefault();
                selectModel();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                dismissed.current = {
                  text: value,
                  caret: inputRef.current?.selection().focus ?? value.length,
                };
                setMention(null);
                setActiveIndex(0);
              } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex(
                  (index) =>
                    (index +
                      (event.key === 'ArrowDown' ? 1 : -1) +
                      options.length) %
                    options.length,
                );
              }
            }}
            onChange={(text) => {
              dismissed.current = null;
              setActiveIndex(0);
              onChange(text);
            }}
            onSubmit={submit}
          />
        }
        value={value}
        onChange={onChange}
        onSubmit={submit}
        onStop={onStop}
        busy={busy}
        disabled={disabled}
      />
    </div>
  );
}
