import { common, createLowlight } from 'lowlight';
import { memo, useMemo, type ReactNode } from 'react';
import CopyButton from '../ui/CopyButton';

const highlighter = createLowlight(common);
type HighlightNode = ReturnType<
  typeof highlighter.highlight
>['children'][number];

function highlightNodes(nodes: HighlightNode[]): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === 'text') return node.value;
    if (node.type !== 'element') return null;
    const className = node.properties.className;
    return (
      <span
        key={index}
        className={Array.isArray(className) ? className.join(' ') : undefined}
      >
        {highlightNodes(node.children)}
      </span>
    );
  });
}

export default memo(function CodeBlock({
  code,
  language = 'text',
  streaming = false,
}: {
  code: string;
  language?: string;
  streaming?: boolean;
}) {
  const highlighted = useMemo(() => {
    if (streaming || !highlighter.registered(language)) return code;
    try {
      return highlightNodes(highlighter.highlight(language, code).children);
    } catch {
      return code;
    }
  }, [code, language, streaming]);

  return (
    <div className="markdown-code">
      <div className="markdown-code-header">
        <span>{language}</span>
        <CopyButton label="Copy code" text={code} />
      </div>
      <pre>
        <code>{highlighted}</code>
      </pre>
    </div>
  );
});
