import type { AgentEvent, AgentSession } from '../../../../shared/agent/types';

export type MessageBlock =
  | { type: 'text'; text: string; streaming: boolean }
  | {
      type: 'tool';
      id: string;
      name: string;
      status: 'running' | 'done' | 'error' | 'stopped';
    };

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  invocationId?: string;
  blocks: MessageBlock[];
};

export function sessionTitle(session: AgentSession) {
  return (
    session.state?.__session_metadata__?.displayName ||
    session.events
      ?.find((event) => event.author === 'user')
      ?.content?.parts?.filter((part) => !part.thought)
      .map((part) => part.text || '')
      .join('')
      .slice(0, 60) ||
    'New chat'
  );
}

export function appendEvent(
  messages: ChatMessage[],
  event: AgentEvent,
): ChatMessage[] {
  if (event.actions?.compaction) return messages;
  const parts = event.content?.parts?.filter((part) => !part.thought) ?? [];
  const text = parts.map((part) => part.text || '').join('');
  const calls = event.partial
    ? []
    : parts.flatMap((part) => (part.functionCall ? [part.functionCall] : []));
  const responses = parts.flatMap((part) =>
    part.functionResponse ? [part.functionResponse] : [],
  );
  if (!text && !calls.length && !responses.length) return messages;

  if (event.author === 'user' && !responses.length) {
    return [
      ...messages,
      {
        id: event.id || `user-${messages.length}`,
        role: 'user',
        blocks: [{ type: 'text', text, streaming: false }],
      },
    ];
  }

  const last = messages.at(-1);
  const continuing =
    last?.role === 'assistant' &&
    (!event.invocationId ||
      !last.invocationId ||
      last.invocationId === event.invocationId);
  const message: ChatMessage = continuing
    ? { ...last, blocks: [...last.blocks] }
    : {
        id: event.id || `assistant-${messages.length}`,
        role: 'assistant',
        invocationId: event.invocationId,
        blocks: [],
      };
  if (text) {
    const previous = message.blocks.at(-1);
    if (previous?.type === 'text' && previous.streaming) {
      // ADK sends deltas, followed by a non-partial event containing the full response.
      message.blocks[message.blocks.length - 1] = {
        type: 'text',
        text: event.partial ? previous.text + text : text,
        streaming: !!event.partial,
      };
    } else {
      message.blocks.push({ type: 'text', text, streaming: !!event.partial });
    }
  }
  for (const call of calls) {
    const id = call.id || `${event.id}-${call.name}`;
    if (
      !message.blocks.some((block) => block.type === 'tool' && block.id === id)
    ) {
      message.blocks.push({
        type: 'tool',
        id,
        name: call.name,
        status: 'running',
      });
    }
  }
  for (const response of responses) {
    const index = message.blocks.findLastIndex(
      (block) =>
        block.type === 'tool' &&
        (response.id
          ? block.id === response.id
          : block.name === response.name && block.status === 'running'),
    );
    if (index !== -1) {
      const block = message.blocks[index];
      if (block.type === 'tool') {
        message.blocks[index] = {
          ...block,
          status: response.response?.error ? 'error' : 'done',
        };
      }
    }
  }
  return continuing
    ? [...messages.slice(0, -1), message]
    : [...messages, message];
}

export function finishMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => ({
    ...message,
    blocks: message.blocks.map((block) =>
      block.type === 'text'
        ? { ...block, streaming: false }
        : {
            ...block,
            status: block.status === 'running' ? 'stopped' : block.status,
          },
    ),
  }));
}

export function sessionMessages(session: AgentSession) {
  return finishMessages((session.events ?? []).reduce(appendEvent, []));
}
