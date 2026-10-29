import { decodeHTML } from 'entities';
import type { MarkedToken, Token } from 'marked';
import { createElement, type ReactNode } from 'react';
import CodeBlock from './CodeBlock';
import { isOpenCodeFence, safeUrl } from './parse';

function content(tokens: Token[], streaming = false): ReactNode {
  return tokens.map((token, index) => (
    <TokenContent
      key={index}
      token={token as MarkedToken}
      streaming={streaming && index === tokens.length - 1}
    />
  ));
}

export default function TokenContent({
  token,
  streaming = false,
}: {
  token: MarkedToken;
  streaming?: boolean;
}): ReactNode {
  switch (token.type) {
    case 'heading':
      return createElement(`h${token.depth}`, null, content(token.tokens));
    case 'paragraph':
      return <p>{content(token.tokens)}</p>;
    case 'text':
      return token.tokens
        ? content(token.tokens, streaming)
        : token.escaped
          ? token.text
          : decodeHTML(token.text);
    case 'escape':
      return token.text;
    case 'strong':
      return <strong>{content(token.tokens)}</strong>;
    case 'em':
      return <em>{content(token.tokens)}</em>;
    case 'del':
      return <del>{content(token.tokens)}</del>;
    case 'codespan':
      return <code>{token.text}</code>;
    case 'br':
      return <br />;
    case 'hr':
      return <hr />;
    case 'code':
      return (
        <CodeBlock
          code={token.text}
          language={token.lang?.split(/\s+/)[0] || 'text'}
          streaming={streaming && isOpenCodeFence(token)}
        />
      );
    case 'blockquote':
      return <blockquote>{content(token.tokens, streaming)}</blockquote>;
    case 'list': {
      const items = token.items.map((item, index) => (
        <li key={index} className={item.task ? 'markdown-task' : undefined}>
          {content(item.tokens, streaming && index === token.items.length - 1)}
        </li>
      ));
      return token.ordered ? (
        <ol start={token.start || 1}>{items}</ol>
      ) : (
        <ul>{items}</ul>
      );
    }
    case 'list_item':
      return <li>{content(token.tokens, streaming)}</li>;
    case 'checkbox':
      return (
        <input
          type="checkbox"
          checked={token.checked}
          disabled
          aria-label={token.checked ? 'Completed task' : 'Incomplete task'}
        />
      );
    case 'table':
      return (
        <div className="markdown-table">
          <table>
            <thead>
              <tr>
                {token.header.map((cell, index) => (
                  <th
                    key={index}
                    scope="col"
                    style={{ textAlign: cell.align ?? undefined }}
                  >
                    {content(cell.tokens)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {token.rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, column) => (
                    <td
                      key={column}
                      style={{ textAlign: cell.align ?? undefined }}
                    >
                      {content(cell.tokens)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'link': {
      const href = safeUrl(token.href, { literal: token.autolink });
      const children = content(token.tokens);
      return href ? (
        <a
          href={href}
          title={token.title ? decodeHTML(token.title) : undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ) : (
        children
      );
    }
    case 'image': {
      const src = safeUrl(token.href, { image: true });
      return src ? (
        <img
          src={src}
          alt={decodeHTML(token.text)}
          title={token.title ? decodeHTML(token.title) : undefined}
          loading="lazy"
        />
      ) : (
        decodeHTML(token.text)
      );
    }
    case 'html':
    case 'def':
    case 'space':
      return null;
  }
}
