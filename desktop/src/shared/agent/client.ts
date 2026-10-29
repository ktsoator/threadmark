import { createParser } from 'eventsource-parser';
import type { AgentEvent, AgentSession, RunRequest } from './types';

const appName = 'assistant';
const userId = 'desktop-user';
const sessionsPath = `/apps/${appName}/users/${userId}/sessions`;

export function createAdkClient(baseURL: string) {
  const base = baseURL.replace(/\/+$/, '');

  async function request(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...init.headers },
        signal: init.signal ?? AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new Error(
        'Cannot reach the agent service. Check that it is running on port 8090.',
      );
    }
    if (!response.ok) {
      const detail = (await response.text()).trim().slice(0, 400);
      throw new Error(
        detail || `The agent service returned HTTP ${response.status}.`,
      );
    }
    return response;
  }

  return {
    async listSessions(): Promise<AgentSession[]> {
      return (await request(sessionsPath)).json();
    },
    async getSession(id: string): Promise<AgentSession> {
      return (
        await request(`${sessionsPath}/${encodeURIComponent(id)}`)
      ).json();
    },
    async createSession(title: string): Promise<AgentSession> {
      return (
        await request(sessionsPath, {
          method: 'POST',
          body: JSON.stringify({
            state: { __session_metadata__: { displayName: title } },
          }),
        })
      ).json();
    },
    async renameSession(id: string, title: string): Promise<AgentSession> {
      const displayName = title.trim();
      if (!displayName) throw new Error('Enter a conversation name.');
      const path = `${sessionsPath}/${encodeURIComponent(id)}`;
      const session: AgentSession = await (await request(path)).json();
      return (
        await request(path, {
          method: 'PATCH',
          body: JSON.stringify({
            stateDelta: {
              // ADK replaces each state key, so preserve the other metadata fields.
              __session_metadata__: {
                ...session.state.__session_metadata__,
                displayName,
              },
            },
          }),
        })
      ).json();
    },
    async deleteSession(id: string): Promise<void> {
      await request(`${sessionsPath}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    async run(
      { sessionId, text }: RunRequest,
      onEvent: (event: AgentEvent) => void,
      signal: AbortSignal,
    ) {
      const response = await request('/run_sse', {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
        body: JSON.stringify({
          appName,
          userId,
          sessionId,
          newMessage: { role: 'user', parts: [{ text }] },
          streaming: true,
        }),
        signal,
      });
      if (
        !response.body ||
        !response.headers.get('content-type')?.includes('text/event-stream')
      ) {
        throw new Error('The agent service did not return a message stream.');
      }

      let received = false;
      let partial = false;
      const parser = createParser({
        onEvent(message) {
          if (message.data === '[DONE]') return;
          const event: AgentEvent & { error?: string } = JSON.parse(
            message.data,
          );
          if (
            message.event === 'error' ||
            event.error ||
            event.errorCode ||
            event.errorMessage
          ) {
            throw new Error(
              event.error ||
                event.errorMessage ||
                event.errorCode ||
                'The agent could not finish its reply.',
            );
          }
          received = true;
          partial = event.partial === true;
          onEvent(event);
        },
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
        parser.feed(decoder.decode());
        if (!received || partial) {
          throw new Error('The connection closed before the reply finished.');
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
  };
}
