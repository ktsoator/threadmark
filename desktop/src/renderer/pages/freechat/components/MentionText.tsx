import type { ReactNode } from 'react';
import { findModelMentions } from '../lib/mention';
import ModelMention from './ModelMention';

export default function MentionText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const mention of findModelMentions(text)) {
    parts.push(text.slice(cursor, mention.start));
    parts.push(<ModelMention key={mention.start} model={mention.model} />);
    cursor = mention.end;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}
