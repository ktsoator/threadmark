import { decodeHTML } from 'entities';
import { Marked, type MarkedToken, type Tokens } from 'marked';

const parser = new Marked({ gfm: true });

export function parseMarkdown(text: string) {
  return parser
    .lexer(text)
    .filter((token) => !['space', 'def', 'html'].includes(token.type))
    .map((token) => ({
      token: token as MarkedToken,
      // A later reference definition can change a block without changing its raw text.
      signature: JSON.stringify(token),
    }));
}

export function safeUrl(
  value: string,
  { image = false, literal = false } = {},
) {
  const href = literal ? value : decodeHTML(value);
  try {
    const url = new URL(href, 'https://threadmark.local');
    if (
      url.protocol === 'http:' ||
      url.protocol === 'https:' ||
      (!image && url.protocol === 'mailto:')
    ) {
      return href;
    }
  } catch {
    // Incomplete destinations can arrive while an answer is streaming.
  }
  return undefined;
}

export function isOpenCodeFence(token: Tokens.Code) {
  const lines = token.raw.trimEnd().split('\n');
  const opening = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0]);
  if (!opening) return false;
  const fence = opening[1];
  const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);
  return !lines.slice(1).some((line) => closing.test(line));
}
