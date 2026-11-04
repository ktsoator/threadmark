import { models } from '../lib/models';

export const modelMentionClassName =
  'inline-flex items-center gap-0.5 rounded bg-accent-soft px-1 align-baseline font-medium whitespace-nowrap text-accent';

export default function ModelMention({
  model,
}: {
  model: (typeof models)[number];
}) {
  return (
    <span className={modelMentionClassName}>
      <span>@</span>
      <img
        src={model.logo}
        alt=""
        className="size-4 shrink-0 self-center object-contain"
      />
      <span>{model.name}</span>
    </span>
  );
}
