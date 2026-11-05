import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LoaderCircle,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../../components/ui/DropdownMenu';
import type useModels from '../hooks/useModels';
import { modelLogo } from '../../../lib/modelLogo';

function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Choice({
  name,
  value,
  disabled,
  children,
  compact,
  section,
  onNavigate,
}: {
  name: string;
  value: string;
  disabled?: boolean;
  children: ReactNode;
  compact: boolean;
  section: string | null;
  onNavigate: (name: string) => void;
}) {
  const label = (
    <>
      <span>{name}</span>
      <span className="ml-auto min-w-0 truncate text-muted-foreground">
        {value}
      </span>
    </>
  );
  if (compact) {
    if (section) return section === name ? children : null;
    return (
      <DropdownMenuItem
        disabled={disabled}
        className="gap-2 px-1.5"
        onSelect={(event) => {
          event.preventDefault();
          onNavigate(name);
        }}
      >
        {label}
        <ChevronRight className="text-muted-foreground" />
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent aria-label={name}>
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export default function ModelMenu({
  models,
}: {
  models: ReturnType<typeof useModels>;
}) {
  const { catalog, selection, setSelection, loading, error, retry } = models;
  const [compact, setCompact] = useState(
    () => window.matchMedia('(max-width: 600px)').matches,
  );
  const [section, setSection] = useState<string | null>(null);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 600px)');
    const change = (event: MediaQueryListEvent) => {
      setCompact(event.matches);
      setSection(null);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  const navigation = { compact, section, onNavigate: setSection };
  const provider = catalog?.providers.find(
    (item) => item.id === selection?.providerId,
  );
  const model = provider?.models.find((item) => item.id === selection?.modelId);
  const logo = model && modelLogo(model.id);
  const toggle = model?.reasoningOptions.some(
    (option) => option.type === 'toggle',
  );
  const efforts = model?.reasoningOptions.find(
    (option) => option.type === 'effort',
  )?.values;
  const thinking = selection?.thinking;
  const mode =
    thinking?.enabled === undefined
      ? 'default'
      : thinking.enabled
        ? 'on'
        : 'off';
  const effort = thinking?.effort ?? 'default';
  const summary =
    mode === 'off'
      ? 'Off'
      : effort !== 'default'
        ? label(effort)
        : mode === 'on'
          ? 'On'
          : '';

  return (
    <DropdownMenu onOpenChange={() => setSection(null)}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={loading}
          aria-label={
            model
              ? `Model settings: ${model.name}${summary ? `, ${summary}` : ''}`
              : loading
                ? 'Loading models'
                : 'Choose model'
          }
          className="flex h-7.5 max-w-full min-w-0 items-center gap-1.5 rounded-full px-2 text-ui text-secondary-foreground outline-none hover:bg-hover focus-visible:bg-hover disabled:opacity-60 data-[state=open]:bg-hover"
        >
          {loading && (
            <LoaderCircle
              size={14}
              className="shrink-0 motion-safe:animate-spin"
            />
          )}
          {!loading && logo && (
            <img src={logo} alt="" className="size-4 shrink-0 object-contain" />
          )}
          <span className="max-w-48 truncate">
            {model?.name ?? (loading ? 'Loading models…' : 'Choose model')}
          </span>
          {summary && (
            <span className="shrink-0 text-muted-foreground">{summary}</span>
          )}
          <ChevronUp size={12} className="shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-66 max-w-[calc(100vw-1rem)] overflow-y-auto [scrollbar-width:thin]"
        aria-label="Model settings"
      >
        {selection && provider && model ? (
          <>
            {compact && section && (
              <>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setSection(null);
                  }}
                  className="px-1.5"
                >
                  <ChevronLeft /> Back to model settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <Choice {...navigation} name="Provider" value={provider.name}>
              <DropdownMenuRadioGroup
                value={provider.id}
                onValueChange={(id) => {
                  if (id === provider.id) return;
                  const next = catalog?.providers.find(
                    (item) => item.id === id,
                  );
                  if (next?.models[0])
                    setSelection({
                      providerId: id,
                      modelId: next.models[0].id,
                    });
                }}
              >
                {catalog?.providers.map((item) => (
                  <DropdownMenuRadioItem key={item.id} value={item.id}>
                    {item.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </Choice>
            <Choice {...navigation} name="Model" value={model.name}>
              <p className="px-1.5 py-1.5 text-caption text-muted-foreground">
                {provider.name} models
              </p>
              <DropdownMenuRadioGroup
                value={model.id}
                onValueChange={(id) => {
                  if (id !== model.id)
                    setSelection({ providerId: provider.id, modelId: id });
                }}
              >
                {provider.models.map((item) => (
                  <DropdownMenuRadioItem key={item.id} value={item.id}>
                    {item.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </Choice>
            {toggle && (
              <Choice {...navigation} name="Thinking" value={label(mode)}>
                <DropdownMenuRadioGroup
                  value={mode}
                  onValueChange={(value) =>
                    setSelection({
                      ...selection,
                      thinking:
                        value === 'off'
                          ? { enabled: false }
                          : value === 'default'
                            ? undefined
                            : {
                                enabled: true,
                                effort:
                                  thinking?.effort === 'none'
                                    ? undefined
                                    : thinking?.effort,
                              },
                    })
                  }
                >
                  {['default', 'on', 'off'].map((value) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {label(value)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </Choice>
            )}
            {!!efforts?.length && (
              <Choice
                {...navigation}
                name="Effort"
                value={mode === 'off' ? 'Off' : label(effort)}
                disabled={mode === 'off'}
              >
                <DropdownMenuRadioGroup
                  value={effort}
                  onValueChange={(value) =>
                    setSelection({
                      ...selection,
                      thinking: {
                        enabled:
                          value === 'none' ? undefined : thinking?.enabled,
                        effort: value === 'default' ? undefined : value,
                      },
                    })
                  }
                >
                  {['default', ...efforts].map((value) => (
                    <DropdownMenuRadioItem key={value} value={value}>
                      {label(value)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </Choice>
            )}
          </>
        ) : (
          <>
            <p
              role="status"
              className="px-2 py-2 text-caption text-muted-foreground [overflow-wrap:anywhere]"
            >
              {error ||
                'No models available. Configure a provider in the agent service, then retry.'}
            </p>
            <DropdownMenuItem onSelect={retry}>
              Retry loading models
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
