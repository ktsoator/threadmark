import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../lib/cn';
import { providerLogo } from '../../../lib/modelLogo';
import PromptComposer from '../../home/components/PromptComposer';
import type useModels from '../../home/hooks/useModels';
import { mentionsModel } from '../lib/mention';
import { modelMentionToken, toMentionModel } from '../lib/models';
import MentionEditor, { type MentionEditorHandle } from './MentionEditor';

type MentionRange = { start: number; end: number; query: string };
const rowClass =
  'flex h-7.5 w-full items-center gap-2 rounded-xl px-1.5 text-left text-ui leading-4 text-foreground';
const panelClass =
  'rounded-2xl border border-foreground/12 bg-background p-1 text-ui shadow-[0_6px_18px_#0000000a]';
const providerAliases: Record<string, string> = {
  moonshotai: 'kimi',
  'moonshotai-cn': 'kimi',
  google: 'gemini',
  anthropic: 'claude',
};

export default function FreeChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  disabled,
  models,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  disabled: boolean;
  models: ReturnType<typeof useModels>;
}) {
  const inputRef = useRef<MentionEditorHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const providerListRef = useRef<HTMLDivElement>(null);
  const modelListRef = useRef<HTMLDivElement>(null);
  const dismissed = useRef<{ text: string; caret: number } | null>(null);
  const [mention, setMention] = useState<MentionRange | null>(null);
  const [providerIndex, setProviderIndex] = useState(0);
  const [modelIndex, setModelIndex] = useState(0);
  const [openProviderId, setOpenProviderId] = useState<string | null>(null);
  const [level, setLevel] = useState<'providers' | 'models'>('providers');
  const [compact, setCompact] = useState(false);
  const asking = mentionsModel(value);
  const providers = useMemo(
    () =>
      (models.catalog?.providers ?? []).filter((provider) =>
        `${provider.name} ${provider.id} ${providerAliases[provider.id] ?? ''}`
          .toLowerCase()
          .includes(mention?.query ?? ''),
      ),
    [models.catalog, mention?.query],
  );
  const activeProvider = providers[providerIndex] ?? providers[0];
  const openProvider = providers.find(
    (provider) => provider.id === openProviderId,
  );
  const options = useMemo(
    () =>
      openProvider?.models.map((model) =>
        toMentionModel(openProvider, model),
      ) ?? [],
    [openProvider],
  );
  const activeModel = options[modelIndex] ?? options[0];
  const activeId =
    level === 'models'
      ? activeModel && `freechat-model-${options.indexOf(activeModel)}`
      : activeProvider &&
        `freechat-provider-${providers.indexOf(activeProvider)}`;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const resize = () => setCompact(root.clientWidth < 440);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const list =
      level === 'models' ? modelListRef.current : providerListRef.current;
    list
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [providerIndex, modelIndex, level, mention?.query]);

  function resetMenu() {
    setProviderIndex(0);
    setModelIndex(0);
    setOpenProviderId(null);
    setLevel('providers');
  }

  function updateMention(text: string, caret: number) {
    if (dismissed.current?.text === text && dismissed.current.caret === caret) {
      setMention(null);
      return;
    }
    dismissed.current = null;
    const match = text
      .slice(0, caret)
      .match(/(?:^|[\s（(，,。！!？?：:；;])@([a-z0-9 ._()-]*)$/i);
    const query = match?.[1].toLowerCase();
    if (query === undefined) {
      setMention(null);
      return;
    }
    const start = caret - query.length - 1;
    if (mention?.start !== start || mention.query !== query) resetMenu();
    const suffix = text.slice(caret).match(/^[a-z0-9._-]*/i)?.[0] ?? '';
    setMention({ start, end: caret + suffix.length, query });
  }

  function openProviderMenu(index: number, enter = false) {
    const provider = providers[index];
    if (!provider) return;
    setProviderIndex(index);
    setOpenProviderId(provider.id);
    setModelIndex(0);
    setLevel(enter ? 'models' : 'providers');
  }

  function backToProviders() {
    setOpenProviderId(null);
    setLevel('providers');
  }

  function selectModel(model = activeModel) {
    if (!mention || !model) return;
    inputRef.current?.replace(
      mention.start,
      mention.end,
      `${modelMentionToken(model)} `,
    );
    setMention(null);
    resetMenu();
  }

  function submit() {
    if (!value.trim() || busy || disabled || (asking && !models.catalog))
      return;
    setMention(null);
    onSubmit();
    inputRef.current?.focus();
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setMention(null);
      }}
    >
      {mention && (
        <div
          className={cn(
            'absolute bottom-full left-0 z-20 mb-1 max-w-full',
            compact && openProvider ? 'w-60' : 'w-48',
          )}
        >
          {(!compact || !openProvider) && (
            <div className={panelClass}>
              <div
                ref={providerListRef}
                id="freechat-providers"
                role="listbox"
                aria-label="Choose a provider"
                className="max-h-60 overflow-y-auto [scrollbar-width:thin]"
              >
                {providers.map((provider, index) => {
                  const logo = providerLogo(provider.id);
                  return (
                    <button
                      key={provider.id}
                      id={`freechat-provider-${index}`}
                      type="button"
                      role="option"
                      aria-selected={provider === activeProvider}
                      aria-expanded={provider.id === openProviderId}
                      aria-controls={
                        provider.id === openProviderId
                          ? 'freechat-models'
                          : undefined
                      }
                      aria-haspopup="listbox"
                      tabIndex={-1}
                      className={cn(
                        rowClass,
                        provider === activeProvider && 'bg-hover',
                      )}
                      onMouseEnter={() => {
                        if (!compact) openProviderMenu(index);
                      }}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openProviderMenu(index, true)}
                      title={provider.name}
                    >
                      {logo && (
                        <img
                          src={logo}
                          alt=""
                          className="size-4 shrink-0 object-contain"
                        />
                      )}
                      <span className="min-w-0 truncate">{provider.name}</span>
                      <ChevronRight
                        size={14}
                        className="ml-auto shrink-0 text-muted-foreground"
                      />
                    </button>
                  );
                })}
              </div>
              {!providers.length && (
                <p
                  role="status"
                  className="px-1.5 py-2 text-caption text-muted-foreground"
                >
                  {models.loading
                    ? 'Loading providers…'
                    : models.error ||
                      (models.catalog
                        ? 'No matching providers.'
                        : 'No providers available.')}
                </p>
              )}
              {!models.loading && !models.catalog && (
                <button
                  type="button"
                  className={cn(
                    rowClass,
                    'hover:bg-hover focus-visible:bg-hover',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={models.retry}
                >
                  Retry loading models
                </button>
              )}
            </div>
          )}
          {openProvider && (
            <div
              className={cn(
                panelClass,
                !compact && 'absolute bottom-0 left-full ml-1 w-60',
              )}
            >
              {compact ? (
                <button
                  type="button"
                  className={cn(
                    rowClass,
                    'text-muted-foreground hover:bg-hover',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={backToProviders}
                >
                  <ChevronLeft size={14} /> Back to providers
                </button>
              ) : null}
              <p className="truncate px-1.5 py-1.5 text-caption text-muted-foreground">
                {openProvider.name} models
              </p>
              <div
                ref={modelListRef}
                id="freechat-models"
                role="listbox"
                aria-label={`${openProvider.name} models`}
                className="max-h-60 overflow-y-auto [scrollbar-width:thin]"
              >
                {options.map((model, index) => (
                  <button
                    key={model.id}
                    id={`freechat-model-${index}`}
                    type="button"
                    role="option"
                    aria-selected={level === 'models' && model === activeModel}
                    tabIndex={-1}
                    className={cn(
                      rowClass,
                      level === 'models' && model === activeModel && 'bg-hover',
                    )}
                    onMouseEnter={() => {
                      setModelIndex(index);
                      setLevel('models');
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectModel(model)}
                    title={model.name}
                  >
                    {model.logo && (
                      <img
                        src={model.logo}
                        alt=""
                        className="size-4 shrink-0 object-contain"
                      />
                    )}
                    <span className="min-w-0 truncate">{model.name}</span>
                  </button>
                ))}
              </div>
              {!options.length && (
                <p
                  role="status"
                  className="px-1.5 py-2 text-caption text-muted-foreground"
                >
                  No models listed for this provider.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <PromptComposer
        compact
        submitLabel={asking ? 'Ask AI' : 'Save thought'}
        leadingAction={null}
        editor={
          <MentionEditor
            ref={inputRef}
            value={value}
            suggestionsId={
              mention
                ? level === 'models'
                  ? 'freechat-models'
                  : 'freechat-providers'
                : undefined
            }
            activeSuggestionId={mention ? activeId : undefined}
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
                event.key === 'Escape' ||
                (event.key === 'ArrowLeft' && openProvider)
              ) {
                event.preventDefault();
                if (openProvider) backToProviders();
                else {
                  dismissed.current = {
                    text: value,
                    caret: inputRef.current?.selection().focus ?? value.length,
                  };
                  setMention(null);
                  resetMenu();
                }
              } else if (
                ((event.key === 'Enter' || event.key === 'Tab') &&
                  !event.shiftKey) ||
                (event.key === 'ArrowRight' && level === 'providers')
              ) {
                event.preventDefault();
                if (level === 'providers')
                  openProviderMenu(providers.indexOf(activeProvider), true);
                else selectModel();
              } else if (
                event.key === 'ArrowDown' ||
                event.key === 'ArrowUp' ||
                event.key === 'Home' ||
                event.key === 'End'
              ) {
                event.preventDefault();
                const count =
                  level === 'models' ? options.length : providers.length;
                if (!count) return;
                const current = level === 'models' ? modelIndex : providerIndex;
                const next =
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? count - 1
                      : (current +
                          (event.key === 'ArrowDown' ? 1 : -1) +
                          count) %
                        count;
                if (level === 'models') setModelIndex(next);
                else if (openProvider) openProviderMenu(next);
                else setProviderIndex(next);
              }
            }}
            onChange={(text) => {
              dismissed.current = null;
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
        disabled={disabled || (asking && !models.catalog)}
      />
    </div>
  );
}
