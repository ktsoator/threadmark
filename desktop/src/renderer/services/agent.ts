import { createAdkClient } from '../../shared/agent/client';
import type { AgentEvent, RunRequest } from '../../shared/agent/types';

const browserClient = createAdkClient('/api');

export const listSessions = () =>
  (window.agent ?? browserClient).listSessions();
export const getSession = (id: string) =>
  (window.agent ?? browserClient).getSession(id);
export const createSession = (title: string) =>
  (window.agent ?? browserClient).createSession(title);

export async function runAgent(
  request: RunRequest,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
) {
  if (!window.agent) return browserClient.run(request, onEvent, signal);

  const bridge = window.agent;
  const requestId = crypto.randomUUID();
  signal.throwIfAborted();
  const unsubscribe = bridge.onEvent((message) => {
    if (message.requestId === requestId && !signal.aborted)
      onEvent(message.event);
  });
  const cancel = () => bridge.cancelRun(requestId);
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await bridge.run(requestId, request);
    signal.throwIfAborted();
    if (result.error) throw new Error(result.error);
  } finally {
    signal.removeEventListener('abort', cancel);
    unsubscribe();
  }
}
