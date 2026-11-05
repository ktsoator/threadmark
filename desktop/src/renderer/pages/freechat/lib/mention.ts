import type { ModelList, ModelSelection } from '../../../../shared/agent/types';
import { modelLogo } from '../../../lib/modelLogo';
import {
  availableMentionModels,
  legacyModels,
  type MentionModel,
} from './models';

// Require a boundary so emails, URLs and longer handles stay ordinary text.
const mentionPattern =
  /(^|[\s（(，,。！!？?：:；;])@(?:\[([^\]\r\n]+)\]\(([^/\s()]+)\/([^\s()]+)\)|(ai|deepseek|google|gemini|claude)(?![a-z0-9_.+-]))/giu;

export function findModelMentions(text: string) {
  const mentions: { start: number; end: number; model: MentionModel }[] = [];
  for (const match of text.matchAll(mentionPattern)) {
    let model: MentionModel | undefined;
    if (match[2]) {
      try {
        const providerId = decodeURIComponent(match[3]);
        const modelId = decodeURIComponent(match[4]);
        model = {
          id: `${providerId}/${modelId}`,
          name: match[2],
          logo: modelLogo(modelId),
          selection: { providerId, modelId },
        };
      } catch {
        continue;
      }
    } else {
      const id = match[5].toLowerCase();
      model = legacyModels.find(
        (item) => item.id === (id === 'google' ? 'gemini' : id),
      );
    }
    if (model)
      mentions.push({
        start: match.index + match[1].length,
        end: match.index + match[0].length,
        model,
      });
  }
  return mentions;
}

export function mentionsModel(text: string) {
  return findModelMentions(text).length > 0;
}

export function mentionLabelText(text: string) {
  let result = '';
  let cursor = 0;
  for (const mention of findModelMentions(text)) {
    result += text.slice(cursor, mention.start) + `@${mention.model.name}`;
    cursor = mention.end;
  }
  return result + text.slice(cursor);
}

export function resolveMentionModel(
  text: string,
  catalog: ModelList | null,
): ModelSelection | null {
  const mentions = findModelMentions(text);
  if (!mentions.length) return null;
  if (!catalog)
    throw new Error(
      'Models are unavailable. Retry loading models from the @ menu.',
    );
  const available = availableMentionModels(catalog);
  const selections = mentions.map(({ model }) => {
    let selection = model.selection;
    if (!selection) {
      const fallback = catalog.defaultSelection;
      if (model.id === 'ai') selection = fallback;
      else {
        const matches = available.filter((item) =>
          item
            .selection!.modelId.toLowerCase()
            .split('/')
            .at(-1)
            ?.startsWith(model.id),
        );
        selection =
          matches.find(
            (item) =>
              item.selection!.providerId === fallback.providerId &&
              item.selection!.modelId === fallback.modelId,
          )?.selection ?? matches[0]?.selection;
      }
    }
    if (
      !selection ||
      !available.some(
        (item) =>
          item.selection!.providerId === selection.providerId &&
          item.selection!.modelId === selection.modelId,
      )
    ) {
      throw new Error(
        `${model.name} is unavailable. Choose another model from the @ menu.`,
      );
    }
    return selection;
  });
  const first = selections[0];
  if (
    selections.some(
      (item) =>
        item.providerId !== first.providerId || item.modelId !== first.modelId,
    )
  ) {
    throw new Error('Mention one model per message.');
  }
  return first;
}
