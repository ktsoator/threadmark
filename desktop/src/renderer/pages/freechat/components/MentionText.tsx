import type { ReactNode } from 'react';
import { findModelMentions } from '../lib/mention';
import { models } from '../lib/models';
import ModelMention from './ModelMention';

export default function MentionText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const mention of findModelMentions(text)) {
    const model = models.find((item) => item.id === mention.modelId);
    if (!model) continue;
    parts.push(text.slice(cursor, mention.start));
    parts.push(<ModelMention key={mention.start} model={model} />);
    cursor = mention.end;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
