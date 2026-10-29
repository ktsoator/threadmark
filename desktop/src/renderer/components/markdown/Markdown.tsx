import { memo, useMemo } from 'react';
import { parseMarkdown } from './parse';
import TokenContent from './TokenContent';
import './markdown.css';

type BlockProps = {
  block: ReturnType<typeof parseMarkdown>[number];
  streaming: boolean;
};

const MarkdownBlock = memo(
  function MarkdownBlock({ block, streaming }: BlockProps) {
    return (
      <div className="markdown-block" data-streaming={streaming || undefined}>
        <TokenContent token={block.token} streaming={streaming} />
      </div>
    );
  },
  (previous, next) =>
    previous.streaming === next.streaming &&
    previous.block.signature === next.block.signature,
);

export default memo(function Markdown({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  return (
    <div className="markdown min-w-0 text-message text-foreground [overflow-wrap:anywhere]">
      {blocks.map((block, index) => (
        <MarkdownBlock
          key={index}
          block={block}
          streaming={streaming && index === blocks.length - 1}
        />
      ))}
    </div>
  );
});
