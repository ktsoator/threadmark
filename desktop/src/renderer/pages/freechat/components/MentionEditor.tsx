import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type KeyboardEventHandler,
  type Ref,
} from 'react';
import {
  editorSelection,
  editorText,
  renderEditor,
  restoreEditorSelection,
  type EditorSelection,
} from '../lib/editor';
import { findModelMentions } from '../lib/mention';

export type MentionEditorHandle = {
  focus: () => void;
  selection: () => EditorSelection;
  replace: (start: number, end: number, text: string) => void;
};

type Snapshot = EditorSelection & { text: string };

export default function MentionEditor({
  ref,
  value,
  onChange,
  onSelectionChange,
  onKeyDown,
  onSubmit,
  suggestionsId,
  activeSuggestionId,
}: {
  ref: Ref<MentionEditorHandle>;
  value: string;
  onChange: (value: string) => void;
  onSelectionChange: (text: string, selection: EditorSelection) => void;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onSubmit: () => void;
  suggestionsId?: string;
  activeSuggestionId?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const composing = useRef(false);
  const history = useRef<{ items: Snapshot[]; index: number }>({
    items: [],
    index: -1,
  });
  const callbacks = useRef({ onSelectionChange, onChange });
  callbacks.current = { onSelectionChange, onChange };

  function remember(snapshot: Snapshot) {
    const current = history.current;
    if (current.items[current.index]?.text === snapshot.text) {
      current.items[current.index] = snapshot;
      return;
    }
    current.items = [
      ...current.items.slice(0, current.index + 1),
      snapshot,
    ].slice(-100);
    current.index = current.items.length - 1;
  }

  function apply(text: string, selection: EditorSelection, record = true) {
    const editor = editorRef.current;
    if (!editor) return;
    renderEditor(editor, text);
    restoreEditorSelection(editor, selection);
    if (record) remember({ text, ...selection });
    callbacks.current.onChange(text);
    callbacks.current.onSelectionChange(text, selection);
  }

  function replace(start: number, end: number, inserted: string) {
    const editor = editorRef.current;
    if (!editor) return;
    const text = editorText(editor);
    remember({ text, ...editorSelection(editor) });
    const caret = start + inserted.length;
    editor.focus();
    apply(text.slice(0, start) + inserted + text.slice(end), {
      anchor: caret,
      focus: caret,
    });
  }

  function insert(text: string) {
    if (!editorRef.current) return;
    const { anchor, focus } = editorSelection(editorRef.current);
    replace(Math.min(anchor, focus), Math.max(anchor, focus), text);
  }

  function undo(redo = false) {
    const current = history.current;
    const index = current.index + (redo ? 1 : -1);
    const snapshot = current.items[index];
    if (!snapshot) return;
    current.index = index;
    apply(snapshot.text, snapshot, false);
  }

  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    selection: () =>
      editorRef.current
        ? editorSelection(editorRef.current)
        : { anchor: 0, focus: 0 },
    replace,
  }));

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || composing.current) return;
    if (editorText(editor) !== value || history.current.index === -1) {
      renderEditor(editor, value);
      const selection = { anchor: value.length, focus: value.length };
      history.current = { items: [{ text: value, ...selection }], index: 0 };
      if (document.activeElement === editor)
        restoreEditorSelection(editor, selection);
    }
  }, [value]);

  useEffect(() => {
    function selectionChanged() {
      const editor = editorRef.current;
      if (!editor || document.activeElement !== editor || composing.current)
        return;
      const text = editorText(editor);
      const selection = editorSelection(editor);
      const current = history.current.items[history.current.index];
      if (current?.text === text) Object.assign(current, selection);
      callbacks.current.onSelectionChange(text, selection);
    }
    document.addEventListener('selectionchange', selectionChanged);
    return () =>
      document.removeEventListener('selectionchange', selectionChanged);
  }, []);

  // Menu-based undo and mobile line breaks also arrive through beforeinput.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    function beforeInput(event: InputEvent) {
      if (event.isComposing || composing.current) return;
      if (
        event.inputType === 'historyUndo' ||
        event.inputType === 'historyRedo'
      ) {
        event.preventDefault();
        undo(event.inputType === 'historyRedo');
      } else if (
        event.inputType === 'insertParagraph' ||
        event.inputType === 'insertLineBreak'
      ) {
        event.preventDefault();
        insert('\n');
      }
    }
    editor.addEventListener('beforeinput', beforeInput);
    return () => editor.removeEventListener('beforeinput', beforeInput);
  });

  function sync() {
    const editor = editorRef.current;
    if (!editor || composing.current) return;
    apply(editorText(editor), editorSelection(editor));
  }

  return (
    <div
      ref={editorRef}
      id="freechat-input"
      role="textbox"
      aria-label="Free chat message"
      aria-multiline="true"
      aria-autocomplete="list"
      aria-controls={suggestionsId}
      aria-activedescendant={activeSuggestionId}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      data-placeholder="Write a thought, or @ a model…"
      className="block max-h-40 min-h-control w-0 min-w-0 flex-1 overflow-y-auto border-0 bg-transparent py-1.5 pl-3 text-body leading-6 text-foreground whitespace-pre-wrap outline-none empty:before:pointer-events-none empty:before:text-placeholder empty:before:content-[attr(data-placeholder)] focus-visible:outline-none [overflow-wrap:anywhere] [scrollbar-width:thin] [-webkit-app-region:no-drag]"
      onInput={sync}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        sync();
      }}
      onPaste={(event) => {
        event.preventDefault();
        insert(
          event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'),
        );
      }}
      onCopy={(event) => {
        const { anchor, focus } = editorSelection(event.currentTarget);
        if (anchor === focus) return;
        event.preventDefault();
        event.clipboardData.setData(
          'text/plain',
          editorText(event.currentTarget).slice(
            Math.min(anchor, focus),
            Math.max(anchor, focus),
          ),
        );
      }}
      onCut={(event) => {
        const { anchor, focus } = editorSelection(event.currentTarget);
        if (anchor === focus) return;
        event.preventDefault();
        event.clipboardData.setData(
          'text/plain',
          editorText(event.currentTarget).slice(
            Math.min(anchor, focus),
            Math.max(anchor, focus),
          ),
        );
        replace(Math.min(anchor, focus), Math.max(anchor, focus), '');
      }}
      onDrop={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (
          event.nativeEvent.isComposing ||
          composing.current ||
          event.keyCode === 229
        )
          return;
        onKeyDown(event);
        if (event.defaultPrevented) return;
        const modifier = event.metaKey || event.ctrlKey;
        if (
          modifier &&
          (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')
        ) {
          event.preventDefault();
          undo(event.shiftKey || event.key.toLowerCase() === 'y');
        } else if (event.key === 'Enter') {
          event.preventDefault();
          if (event.shiftKey) insert('\n');
          else onSubmit();
        } else if (
          !modifier &&
          !event.altKey &&
          (event.key === 'Backspace' || event.key === 'Delete')
        ) {
          const { anchor, focus } = editorSelection(event.currentTarget);
          if (anchor !== focus) return;
          const token = findModelMentions(editorText(event.currentTarget)).find(
            (item) =>
              event.key === 'Backspace'
                ? item.end === anchor
                : item.start === anchor,
          );
          if (token) {
            event.preventDefault();
            replace(token.start, token.end, '');
          }
        }
      }}
    />
  );
}
