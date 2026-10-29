import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentSession } from '../../../../shared/agent/types';
import * as agent from '../../../services/agent';
import {
  appendEvent,
  finishMessages,
  sessionMessages,
  type ChatMessage,
} from '../lib/conversation';

const activeSessionKey = 'threadmark.active-session';

function errorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.';
  return message.replace(/^Error invoking remote method '[^']+': Error: /, '');
}

export default function useConversation() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const version = useRef(0);
  const listVersion = useRef(0);
  const busyRef = useRef(false);
  const run = useRef<AbortController | null>(null);

  const refreshSessions = useCallback(async () => {
    const current = ++listVersion.current;
    try {
      const items = await agent.listSessions();
      if (current !== listVersion.current) return;
      setSessions(items.sort((a, b) => b.lastUpdateTime - a.lastUpdateTime));
      setHistoryError('');
      return items;
    } catch (error) {
      if (current === listVersion.current) setHistoryError(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    const current = ++version.current;
    const saved = localStorage.getItem(activeSessionKey);
    setLoading(!!saved);
    void refreshSessions().then(async (items) => {
      if (current !== version.current) return;
      if (saved && items?.some((item) => item.id === saved)) {
        try {
          const session = await agent.getSession(saved);
          if (current !== version.current) return;
          setActiveId(saved);
          setMessages(sessionMessages(session));
        } catch (error) {
          if (current === version.current) setError(errorMessage(error));
        }
      }
      if (current === version.current) setLoading(false);
    });
    return () => {
      version.current++;
      listVersion.current++;
      run.current?.abort();
    };
  }, [refreshSessions]);

  function newChat() {
    version.current++;
    run.current?.abort();
    run.current = null;
    busyRef.current = false;
    setBusy(false);
    setLoading(false);
    setActiveId(null);
    localStorage.removeItem(activeSessionKey);
    setMessages([]);
    setDraft('');
    setError('');
  }

  async function selectSession(id: string) {
    if (id === activeId) return;
    const current = ++version.current;
    run.current?.abort();
    busyRef.current = false;
    setBusy(false);
    setLoading(true);
    setError('');
    setDraft('');
    setMessages([]);
    setActiveId(id);
    try {
      const session = await agent.getSession(id);
      if (current !== version.current) return;
      setMessages(sessionMessages(session));
      localStorage.setItem(activeSessionKey, id);
    } catch (error) {
      if (current === version.current) {
        setError(errorMessage(error));
        setActiveId(null);
        localStorage.removeItem(activeSessionKey);
      }
    } finally {
      if (current === version.current) setLoading(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busyRef.current || loading) return;
    const current = ++version.current;
    const controller = new AbortController();
    run.current = controller;
    busyRef.current = true;
    setBusy(true);
    setError('');
    let id = activeId;
    try {
      if (!id) {
        const session = await agent.createSession(
          Array.from(text.replace(/\s+/g, ' ')).slice(0, 60).join(''),
        );
        if (current !== version.current || controller.signal.aborted) return;
        id = session.id;
        setActiveId(id);
        localStorage.setItem(activeSessionKey, id);
        setSessions((items) => [
          session,
          ...items.filter((item) => item.id !== id),
        ]);
      }
      setMessages((items) =>
        appendEvent(items, {
          id: crypto.randomUUID(),
          author: 'user',
          content: { role: 'user', parts: [{ text }] },
        }),
      );
      setDraft((currentDraft) => (currentDraft === draft ? '' : currentDraft));
      await agent.runAgent(
        { sessionId: id, text },
        (event) => {
          if (current === version.current && event.author !== 'user') {
            setMessages((items) => appendEvent(items, event));
          }
        },
        controller.signal,
      );
      if (current !== version.current) return;
      // Reload the canonical events so history and the streamed answer stay in sync.
      const session = await agent.getSession(id);
      if (current === version.current) setMessages(sessionMessages(session));
    } catch (error) {
      if (current === version.current && !controller.signal.aborted)
        setError(errorMessage(error));
    } finally {
      if (current === version.current) {
        setMessages(finishMessages);
        busyRef.current = false;
        run.current = null;
        setBusy(false);
        void refreshSessions();
      }
    }
  }

  return {
    sessions,
    activeId,
    messages,
    draft,
    setDraft,
    loading,
    busy,
    error,
    historyError,
    newChat,
    selectSession,
    send,
    refreshSessions,
    stop: () => run.current?.abort(),
  };
}
