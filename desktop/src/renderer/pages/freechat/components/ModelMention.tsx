import type { MentionModel } from '../lib/models';

export const modelMentionClassName =
  'inline-flex max-w-full items-center gap-0.5 rounded bg-accent-soft px-1 align-baseline font-medium whitespace-nowrap text-accent';

export default function ModelMention({ model }: { model: MentionModel }) {
  return (
    <span className={modelMentionClassName} title={model.name}>
      <span>@</span>
      {model.logo && (
        <img
          src={model.logo}
          alt=""
          className="size-4 shrink-0 self-center object-contain"
        />
      )}
      <span className="truncate">{model.name}</span>
    </span>
  );
}
