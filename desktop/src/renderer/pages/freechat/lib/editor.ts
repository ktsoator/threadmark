import { findModelMentions } from './mention';
import { modelMentionClassName } from '../components/ModelMention';
import { models } from './models';

export type EditorSelection = { anchor: number; focus: number };

// The editor and clipboard use the original plain-text handle. The visible
// label can differ for aliases such as @Google, which now displays Gemini.
export function editorText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof HTMLElement) {
    if (node.dataset.mention !== undefined) return node.dataset.mention;
    if (node.hasAttribute('data-editor-trailing')) return '';
    // Chromium inserts a final BR to hold the caret after deleting text.
    // Actual editor line breaks are text nodes, so this filler is not a newline.
    if (node.tagName === 'BR') return node.nextSibling ? '\n' : '';
  }
  let text = '';
  for (const child of node.childNodes) {
    if (
      child instanceof HTMLElement &&
      /^(DIV|P)$/.test(child.tagName) &&
      text &&
      !text.endsWith('\n')
    ) {
      text += '\n';
    }
    text += editorText(child);
  }
  return text;
}

export function editorSelection(editor: HTMLElement): EditorSelection {
  const selection = window.getSelection();
  const end = editorText(editor).length;
  if (
    !selection?.anchorNode ||
    !selection.focusNode ||
    !editor.contains(selection.anchorNode) ||
    !editor.contains(selection.focusNode)
  ) {
    return { anchor: end, focus: end };
  }
  function offset(node: Node, position: number) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.setEnd(node, position);
    return editorText(range.cloneContents()).length;
  }
  return {
    anchor: offset(selection.anchorNode, selection.anchorOffset),
    focus: offset(selection.focusNode, selection.focusOffset),
  };
}

export function restoreEditorSelection(
  editor: HTMLElement,
  selection: EditorSelection,
) {
  function point(offset: number): [Node, number] {
    let cursor = 0;
    for (let index = 0; index < editor.childNodes.length; index++) {
      const node = editor.childNodes[index];
      const length = editorText(node).length;
      if (offset <= cursor + length) {
        if (node.nodeType === Node.TEXT_NODE)
          return [node, Math.max(0, offset - cursor)];
        // A mention is atomic: a caret may only sit before or after it.
        return [editor, index + (offset > cursor ? 1 : 0)];
      }
      cursor += length;
    }
    return [editor, editor.childNodes.length];
  }
  const [anchorNode, anchorOffset] = point(selection.anchor);
  const [focusNode, focusOffset] = point(selection.focus);
  window
    .getSelection()
    ?.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset);
}

export function renderEditor(editor: HTMLElement, text: string) {
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const mention of findModelMentions(text)) {
    const model = models.find((item) => item.id === mention.modelId);
    if (!model) continue;
    fragment.append(document.createTextNode(text.slice(cursor, mention.start)));
    const token = document.createElement('span');
    token.contentEditable = 'false';
    token.dataset.mention = text.slice(mention.start, mention.end);
    token.className = modelMentionClassName;
    const at = document.createElement('span');
    at.textContent = '@';
    const icon = document.createElement('img');
    icon.src = model.logo;
    icon.alt = '';
    icon.draggable = false;
    icon.className = 'size-4 shrink-0 self-center object-contain';
    const label = document.createElement('span');
    label.textContent = model.name;
    token.append(at, icon, label);
    fragment.append(token);
    cursor = mention.end;
  }
  if (cursor < text.length)
    fragment.append(document.createTextNode(text.slice(cursor)));
  if (text.endsWith('\n')) {
    const trailing = document.createElement('br');
    trailing.setAttribute('data-editor-trailing', '');
    fragment.append(trailing);
  }
  editor.replaceChildren(fragment);
}
