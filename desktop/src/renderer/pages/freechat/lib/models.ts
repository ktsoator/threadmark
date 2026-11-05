import type {
  ModelList,
  ModelOption,
  ModelSelection,
} from '../../../../shared/agent/types';
import { modelLogo } from '../../../lib/modelLogo';

export type MentionModel = {
  id: string;
  name: string;
  logo?: string;
  providerName?: string;
  selection?: ModelSelection;
};

// Older records used brand handles without a specific provider or model.
export const legacyModels: MentionModel[] = [
  { id: 'ai', name: 'AI' },
  ...['DeepSeek', 'Gemini', 'Claude'].map((name) => ({
    id: name.toLowerCase(),
    name,
    logo: modelLogo(name),
  })),
];

export function availableMentionModels(
  catalog: ModelList | null,
): MentionModel[] {
  return (
    catalog?.providers.flatMap((provider) =>
      provider.models.map((model) => toMentionModel(provider, model)),
    ) ?? []
  );
}

export function toMentionModel(
  provider: { id: string; name: string },
  model: ModelOption,
): MentionModel {
  return {
    id: `${provider.id}/${model.id}`,
    name: model.name,
    logo: modelLogo(model.id),
    providerName: provider.name,
    selection: { providerId: provider.id, modelId: model.id },
  };
}

export function modelMentionToken(model: MentionModel) {
  if (!model.selection) return `@${model.name}`;
  const { providerId, modelId } = model.selection;
  // Store an explicit target so history and copied mentions keep their model.
  const name = model.name.replace(/[\]\r\n]/g, '');
  return `@[${name}](${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)})`;
}
