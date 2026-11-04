import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentSession } from '../../../../shared/agent/types';
import * as agent from '../../../services/agent';
import {
  appendEvent,
  finishMessages,
  sessionMessages,
  type ChatMessage,
} from '../../home/lib/conversation';
import { mentionsModel } from '../lib/mention';

const activeSessionKey = 'threadmark.active-freechat-session';
const newChatKey = 'new';

type ChatState = {
  messages: ChatMessage[];
  draft: string;
  ready: boolean;
  loading: boolean;
  saving: boolean;
  generating: boolean;
  error: string;
};

function emptyChat(ready = false): ChatState {
  return {
    messages: [],
    draft: '',
    ready,
    loading: false,
    saving: false,
    generating: false,
    error: '',
  };
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : 'Please try again.').replace(
    /^Error invoking remote method '[^']+': Error: /,
    '',
  );
}

export default function useFreeChat(enabled: boolean) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chats, setChats] = useState<Record<string, ChatState>>({
    [newChatKey]: emptyChat(true),
  });
  const [initialized, setInitialized] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const selected = useRef<string | null>(null);
  const selectionVersion = useRef(0);
  const listVersion = useRef(0);
  const loads = useRef(new Map<string, object>());
  const runs = useRef(new Map<string, AbortController>());
  const mounted = useRef(true);
  const key = activeId ?? newChatKey;
  const chat = chats[key] ?? emptyChat();

  const updateChat = useCallback(
    (id: string, update: (chat: ChatState) => ChatState) => {
      if (!mounted.current) return;
      setChats((items) => ({
        ...items,
        [id]: update(items[id] ?? emptyChat()),
      }));
    },
    [],
  );

  const refreshSessions = useCallback(async () => {
    const current = ++listVersion.current;
    try {
      const items = (await agent.listSessions())
        .filter((item) => item.state.__session_metadata__?.kind === 'freechat')
        .sort((a, b) => b.lastUpdateTime - a.lastUpdateTime);
      if (current !== listVersion.current) return;
      setSessions(items);
      setHistoryError('');
      return items;
    } catch (error) {
      if (current === listVersion.current) setHistoryError(errorMessage(error));
    }
  }, []);

  const loadSession = useCallback(
    async (id: string) => {
      if (runs.current.has(id)) return;
      const token = {};
      loads.current.set(id, token);
      updateChat(id, (item) => ({
        ...item,
        loading: true,
        ready: false,
        error: '',
      }));
      try {
        const session = await agent.getSession(id);
        if (loads.current.get(id) !== token) return;
        updateChat(id, (item) => ({
          ...item,
          messages: sessionMessages(session),
          ready: true,
        }));
      } catch (error) {
        if (loads.current.get(id) === token)
          updateChat(id, (item) => ({
            ...item,
            error: `Could not load history: ${errorMessage(error)}`,
          }));
      } finally {
        if (loads.current.get(id) === token) {
          loads.current.delete(id);
          updateChat(id, (item) => ({ ...item, loading: false }));
        }
      }
    },
    [updateChat],
  );

  useEffect(() => {
    mounted.current = true;
    const pendingRuns = runs.current;
    const pendingLoads = loads.current;
    return () => {
      mounted.current = false;
      listVersion.current++;
      pendingLoads.clear();
      for (const controller of pendingRuns.values()) controller.abort();
      pendingRuns.clear();
    };
  }, []);

  useEffect(() => {
    if (!enabled || initialized) return;
    let cancelled = false;
    const current = selectionVersion.current;
    void refreshSessions().then((items) => {
      if (cancelled) return;
      setInitialized(true);
      if (!items || current !== selectionVersion.current) return;
      const saved = localStorage.getItem(activeSessionKey);
      // An empty value remembers an intentionally selected new chat.
      const id =
        saved === ''
          ? null
          : (items.find((item) => item.id === saved)?.id ??
            items[0]?.id ??
            null);
      selected.current = id;
      setActiveId(id);
      if (id) {
        localStorage.setItem(activeSessionKey, id);
        void loadSession(id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, initialized, refreshSessions, loadSession]);

  function newChat() {
    selectionVersion.current++;
    selected.current = null;
    setActiveId(null);
    localStorage.setItem(activeSessionKey, '');
  }

  function selectSession(id: string) {
    selectionVersion.current++;
    selected.current = id;
    setActiveId(id);
    localStorage.setItem(activeSessionKey, id);
    if (!chats[id]?.ready && !loads.current.has(id)) void loadSession(id);
  }

  async function send() {
    const draft = chat.draft;
    const text = draft.trim();
    if (!text || !initialized || !chat.ready || runs.current.has(key)) return;
    let requestKey = key;
    let id = activeId;
    const controller = new AbortController();
    runs.current.set(requestKey, controller);
    const isCurrent = () =>
      mounted.current && runs.current.get(requestKey) === controller;
    updateChat(requestKey, (item) => ({ ...item, saving: true, error: '' }));
    const previousIds = new Set(chat.messages.map((message) => message.id));
    let saved = false;
    let started = false;
    try {
      if (!id) {
        const session = await agent.createSession(
          Array.from(text.replace(/\s+/g, ' ')).slice(0, 60).join(''),
          'freechat',
        );
        if (!isCurrent()) return;
        id = session.id;
        runs.current.delete(requestKey);
        runs.current.set(id, controller);
        requestKey = id;
        setChats((items) => ({
          ...items,
          [session.id]: items[newChatKey],
          [newChatKey]: emptyChat(true),
        }));
        listVersion.current++;
        setSessions((items) => [
          session,
          ...items.filter((item) => item.id !== session.id),
        ]);
        if (selected.current === null) {
          selected.current = id;
          setActiveId(id);
          localStorage.setItem(activeSessionKey, id);
        }
      }
      controller.signal.throwIfAborted();
      if (!mentionsModel(text)) {
        const session = await agent.appendMessage(id, text);
        saved = true;
        if (isCurrent())
          updateChat(requestKey, (item) => ({
            ...item,
            messages: sessionMessages(session),
          }));
      } else {
        started = true;
        updateChat(requestKey, (item) => ({
          ...item,
          saving: false,
          generating: true,
          draft: item.draft === draft ? '' : item.draft,
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
              updateChat(requestKey, (item) => ({
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
        updateChat(requestKey, (item) => ({
          ...item,
          error: `${started ? 'AI could not finish its reply' : 'Could not save your thought'}: ${errorMessage(error)}`,
        }));
    } finally {
      if (id && started && isCurrent()) {
        // Reconcile this session even when another chat is now selected.
        try {
          const session = await agent.getSession(id);
          const messages = sessionMessages(session);
          saved = messages.some(
            (message) =>
              message.role === 'user' &&
              !previousIds.has(message.id) &&
              message.blocks.some(
                (block) => block.type === 'text' && block.text === text,
              ),
          );
          if (isCurrent())
            updateChat(requestKey, (item) => ({ ...item, messages }));
        } catch (error) {
          if (isCurrent())
            updateChat(requestKey, (item) => ({
              ...item,
              ready: false,
              error: `Could not confirm the latest history. Reload history before sending again. ${errorMessage(error)}`,
            }));
        }
      }
      if (isCurrent()) {
        updateChat(requestKey, (item) => ({
          ...item,
          draft: saved
            ? item.draft === draft
              ? ''
              : item.draft
            : started
              ? item.draft || draft
              : item.draft,
          messages: finishMessages(item.messages),
          saving: false,
          generating: false,
        }));
        runs.current.delete(requestKey);
        void refreshSessions();
      }
    }
  }

  async function renameSession(id: string, title: string) {
    try {
      const updated = await agent.renameSession(id, title);
      listVersion.current++;
      setSessions((items) =>
        items
          .map((item) => (item.id === id ? updated : item))
          .sort((a, b) => b.lastUpdateTime - a.lastUpdateTime),
      );
    } catch (error) {
      throw new Error(errorMessage(error));
    }
  }

  async function deleteSession(id: string) {
    runs.current.get(id)?.abort();
    runs.current.delete(id);
    loads.current.delete(id);
    updateChat(id, (item) => ({
      ...item,
      saving: false,
      generating: false,
      loading: false,
      ready: false,
      messages: finishMessages(item.messages),
    }));
    try {
      await agent.deleteSession(id);
      listVersion.current++;
      setSessions((items) => items.filter((item) => item.id !== id));
      setChats((items) => {
        const remaining = { ...items };
        delete remaining[id];
        return remaining;
      });
      if (selected.current === id) newChat();
    } catch (error) {
      void loadSession(id);
      throw new Error(errorMessage(error));
    }
  }

  return {
    ...chat,
    ready: initialized && chat.ready,
    loading: !initialized || chat.loading,
    activeId,
    sessions,
    historyError,
    setDraft: (draft: string) =>
      updateChat(key, (item) => ({ ...item, draft })),
    newChat,
    selectSession,
    renameSession,
    deleteSession,
    refreshSessions,
    send,
    retry: () => {
      if (activeId) void loadSession(activeId);
    },
    stop: () => runs.current.get(key)?.abort(),
  };
}
