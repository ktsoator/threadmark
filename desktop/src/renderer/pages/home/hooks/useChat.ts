import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatKind } from '../../../../shared/agent/types';
import * as agent from '../../../services/agent';
import {
  appendEvent,
  finishMessages,
  sessionMessages,
  type ChatMessage,
} from '../lib/conversation';
import type { ChatTarget, SessionLibrary } from './useSessionLibrary';

type ChatState = {
  messages: ChatMessage[];
  draft: string;
  ready: boolean;
  loading: boolean;
  saving: boolean;
  generating: boolean;
  error: string;
};
const empty = (ready = false): ChatState => ({
  messages: [],
  draft: '',
  ready,
  loading: false,
  saving: false,
  generating: false,
  error: '',
});
const draftKey = (target: ChatTarget) =>
  `draft:${target.kind}:${target.projectId ?? 'standalone'}`;
const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Please try again.';

export default function useChat(
  library: SessionLibrary,
  kind: ChatKind,
  shouldReply: (text: string) => boolean,
) {
  const target = library.target.kind === kind ? library.target : null;
  const key = target ? (target.sessionId ?? draftKey(target)) : 'inactive';
  const [chats, setChats] = useState<Record<string, ChatState>>({});
  const cache = useRef(chats);
  const runs = useRef(new Map<string, AbortController>());
  const loads = useRef(new Map<string, object>());
  const previous = useRef<string | null>(null);
  const mounted = useRef(true);
  const chat = chats[key] ?? empty(!!target && !target.sessionId);
  const update = useCallback(
    (id: string, fn: (value: ChatState) => ChatState) => {
      if (!mounted.current) return;
      setChats((items) => {
        const next = {
          ...items,
          [id]: fn(items[id] ?? empty(id.startsWith('draft:'))),
        };
        cache.current = next;
        return next;
      });
    },
    [],
  );
  const load = useCallback(
    async (id: string) => {
      if (runs.current.has(id)) return;
      const token = {};
      loads.current.set(id, token);
      update(id, (item) => ({
        ...item,
        loading: true,
        ready: false,
        error: '',
      }));
      try {
        const session = await agent.getSession(id);
        if (loads.current.get(id) !== token) return;
        update(id, (item) => ({
          ...item,
          messages: sessionMessages(session),
          ready: true,
        }));
      } catch (error) {
        if (loads.current.get(id) === token)
          update(id, (item) => ({
            ...item,
            error: `Could not load history: ${message(error)}`,
          }));
      } finally {
        if (loads.current.get(id) === token) {
          loads.current.delete(id);
          update(id, (item) => ({ ...item, loading: false }));
        }
      }
    },
    [update],
  );
  useEffect(() => {
    mounted.current = true;
    const pendingRuns = runs.current;
    const pendingLoads = loads.current;
    return () => {
      mounted.current = false;
      pendingLoads.clear();
      pendingRuns.forEach((run) => run.abort());
      pendingRuns.clear();
    };
  }, []);
  useEffect(() => {
    const changed = previous.current !== key;
    if (kind === 'chat' && previous.current && previous.current !== key)
      runs.current.get(previous.current)?.abort();
    previous.current = key;
    if (
      target?.sessionId &&
      (!cache.current[key]?.ready || (kind === 'chat' && changed)) &&
      !loads.current.has(key)
    )
      void load(key);
  }, [key, kind, target?.sessionId, load]);

  async function send() {
    if (
      !target ||
      !library.ready ||
      !chat.ready ||
      chat.loading ||
      runs.current.has(key)
    )
      return;
    const text = chat.draft.trim();
    if (!text) return;
    const originalDraft = chat.draft;
    const expectedSelection = library.selection;
    let requestKey = key;
    let id = target.sessionId;
    let saved = false;
    let started = false;
    const previousIds = new Set(chat.messages.map((item) => item.id));
    const controller = new AbortController();
    runs.current.set(requestKey, controller);
    const isCurrent = () =>
      mounted.current && runs.current.get(requestKey) === controller;
    update(requestKey, (item) => ({
      ...item,
      ready: true,
      saving: true,
      error: '',
    }));
    try {
      if (!id) {
        const session = await library.createSession({
          title: Array.from(text.replace(/\s+/g, ' ')).slice(0, 60).join(''),
          kind,
          projectId: target.projectId ?? undefined,
        });
        if (!isCurrent() || controller.signal.aborted) return;
        id = session.id;
        runs.current.delete(requestKey);
        runs.current.set(id, controller);
        requestKey = id;
        setChats((items) => {
          const next = {
            ...items,
            [session.id]: items[key] ?? {
              ...empty(true),
              draft: originalDraft,
              saving: true,
            },
            [key]: empty(true),
          };
          cache.current = next;
          return next;
        });
        library.adoptCreated(session, expectedSelection);
      }
      controller.signal.throwIfAborted();
      if (!shouldReply(text)) {
        const session = await agent.appendMessage(id, text);
        saved = true;
        if (isCurrent()) {
          update(requestKey, (item) => ({
            ...item,
            messages: sessionMessages(session),
          }));
          library.upsert(session);
        }
      } else {
        started = true;
        update(requestKey, (item) => ({
          ...item,
          saving: false,
          generating: true,
          draft: item.draft === originalDraft ? '' : item.draft,
          messages: appendEvent(item.messages, {
            id: crypto.randomUUID(),
            author: 'user',
            content: { role: 'user', parts: [{ text }] },
          }),
        }));
        await agent.runAgent(
          { sessionId: id, text },
          (event) => {
            if (isCurrent() && event.author !== 'user')
              update(requestKey, (item) => ({
                ...item,
                messages: appendEvent(item.messages, event),
              }));
          },
          controller.signal,
        );
        saved = true;
      }
    } catch (error) {
      if (isCurrent() && !controller.signal.aborted)
        update(requestKey, (item) => ({ ...item, error: message(error) }));
    } finally {
      if (id && started && isCurrent()) {
        try {
          const session = await agent.getSession(id);
          const messages = sessionMessages(session);
          saved = messages.some(
            (item) =>
              item.role === 'user' &&
              !previousIds.has(item.id) &&
              item.blocks.some(
                (block) => block.type === 'text' && block.text === text,
              ),
          );
          if (isCurrent()) {
            update(requestKey, (item) => ({ ...item, messages }));
            library.upsert(session);
          }
        } catch (error) {
          if (isCurrent())
            update(requestKey, (item) => ({
              ...item,
              ready: false,
              error: `Reload history before sending again. ${message(error)}`,
            }));
        }
      }
      if (isCurrent()) {
        update(requestKey, (item) => ({
          ...item,
          draft: saved
            ? item.draft === originalDraft
              ? ''
              : item.draft
            : started
              ? item.draft || originalDraft
              : item.draft,
          messages: finishMessages(item.messages),
          saving: false,
          generating: false,
        }));
        runs.current.delete(requestKey);
      }
    }
  }
  function invalidate(id: string) {
    runs.current.get(id)?.abort();
    runs.current.delete(id);
    loads.current.delete(id);
    update(id, (item) => ({
      ...item,
      ready: false,
      loading: false,
      saving: false,
      generating: false,
      messages: finishMessages(item.messages),
    }));
  }
  return {
    ...chat,
    activeId: target?.sessionId ?? null,
    ready: library.ready && chat.ready,
    loading: !library.ready || chat.loading,
    busy: chat.saving || chat.generating,
    setDraft: (draft: string) =>
      update(key, (item) => ({
        ...item,
        ready: item.ready || (!!target && !target.sessionId),
        draft,
      })),
    send,
    stop: () => runs.current.get(key)?.abort(),
    invalidate,
    reload: (id: string) => {
      if (cache.current[id]) void load(id);
    },
    retry: () => {
      if (target?.sessionId) void load(target.sessionId);
      else void library.refresh();
    },
  };
}
