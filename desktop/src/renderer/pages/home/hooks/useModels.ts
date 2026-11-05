import { useEffect, useState } from 'react';
import type { ModelList, ModelSelection } from '../../../../shared/agent/types';
import * as agent from '../../../services/agent';

const storageKey = 'threadmark.model.v1';

function isAvailable(
  value: unknown,
  catalog: ModelList,
): value is ModelSelection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as ModelSelection;
  const model = catalog.providers
    .find((provider) => provider.id === selection.providerId)
    ?.models.find((model) => model.id === selection.modelId);
  if (!model) return false;
  if (selection.thinking === undefined) return true;
  const thinking = selection.thinking;
  if (!thinking || typeof thinking !== 'object') return false;
  if (
    thinking.enabled !== undefined &&
    (typeof thinking.enabled !== 'boolean' ||
      !model.reasoningOptions.some((option) => option.type === 'toggle'))
  )
    return false;
  if (
    thinking.effort !== undefined &&
    !model.reasoningOptions.some(
      (option) =>
        option.type === 'effort' && option.values?.includes(thinking.effort!),
    )
  )
    return false;
  return (
    !(thinking.enabled === false && thinking.effort) &&
    !(thinking.enabled === true && thinking.effort === 'none')
  );
}

export default function useModels() {
  const [catalog, setCatalog] = useState<ModelList | null>(null);
  const [selection, setSelection] = useState<ModelSelection | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void agent
      .listModels()
      .then((list) => {
        if (!active) return;
        let saved: unknown;
        try {
          saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
        } catch {
          // A missing or outdated preference falls back to the server default.
        }
        setCatalog(list);
        setSelection(
          isAvailable(saved, list)
            ? saved
            : isAvailable(list.defaultSelection, list)
              ? list.defaultSelection
              : null,
        );
      })
      .catch((error: unknown) => {
        if (active)
          setError(
            error instanceof Error ? error.message : 'Could not load models.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (!selection) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(selection));
    } catch {
      // Model selection still works when local storage is unavailable.
    }
  }, [selection]);

  return {
    catalog,
    selection,
    setSelection,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
