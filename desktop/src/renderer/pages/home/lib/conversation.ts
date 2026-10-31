import type { AgentEvent, AgentSession } from '../../../../shared/agent/types';

export type MessageBlock =
  | { type: 'text'; text: string; streaming: boolean }
  | { type: 'thought'; text: string; streaming: boolean }
  | {
      type: 'tool';
      id: string;
      name: string;
      args?: Record<string, unknown>;
      status: 'running' | 'done' | 'error' | 'stopped';
    };

export type ActivityBlock = Exclude<MessageBlock, { type: 'text' }>;

type MessageSection =
  | {
      type: 'text';
      index: number;
      block: Extract<MessageBlock, { type: 'text' }>;
    }
  | { type: 'activity'; index: number; blocks: ActivityBlock[] };

// Only visible assistant prose separates consecutive thoughts and tool calls.
export function messageSections(blocks: MessageBlock[]): MessageSection[] {
  const sections: MessageSection[] = [];
  blocks.forEach((block, index) => {
    if (block.type !== 'tool' && !block.text.trim()) return;
    if (block.type === 'text') {
      sections.push({ type: 'text', index, block });
    } else {
      const previous = sections.at(-1);
      if (previous?.type === 'activity') previous.blocks.push(block);
      else sections.push({ type: 'activity', index, blocks: [block] });
    }
  });
  return sections;
}

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  invocationId?: string;
  // The current model response can stream several thought and text blocks.
  streamingStart?: number;
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
  const parts = event.content?.parts ?? [];
  const content = parts.filter(
    (part) => part.text && (event.author !== 'user' || !part.thought),
  );
  const calls = event.partial
    ? []
    : parts.flatMap((part) =>
        !part.thought && part.functionCall ? [part.functionCall] : [],
      );
  const responses = parts.flatMap((part) =>
    !part.thought && part.functionResponse ? [part.functionResponse] : [],
  );
  const last = messages.at(-1);
  const continuing =
    last?.role === 'assistant' &&
    (!event.invocationId ||
      !last.invocationId ||
      last.invocationId === event.invocationId);
  const completesStream =
    event.author !== 'user' &&
    continuing &&
    last.streamingStart !== undefined &&
    !event.partial &&
    event.turnComplete;
  if (!content.length && !calls.length && !responses.length && !completesStream)
    return messages;

  if (event.author === 'user' && !responses.length) {
    return [
      ...messages,
      {
        id: event.id || `user-${messages.length}`,
        role: 'user',
        blocks: [
          {
            type: 'text',
            text: content.map((part) => part.text).join(''),
            streaming: false,
          },
        ],
      },
    ];
  }

  const message: ChatMessage = continuing
    ? { ...last, blocks: [...last.blocks] }
    : {
        // Keep component state when canonical session events replace the stream.
        id: event.invocationId
          ? `assistant-${event.invocationId}`
          : event.id || `assistant-${messages.length}`,
        role: 'assistant',
        invocationId: event.invocationId,
        blocks: [],
      };
  const responseStart = message.streamingStart ?? message.blocks.length;
  if (event.partial) {
    message.streamingStart = responseStart;
  } else if (message.streamingStart !== undefined && !responses.length) {
    // The final event replaces this response's deltas, including thoughts.
    // A completion marker without content only ends the existing stream.
    if (content.length || calls.length) message.blocks.splice(responseStart);
    else {
      message.blocks = message.blocks.map((block, index) =>
        index >= responseStart && block.type !== 'tool'
          ? { ...block, streaming: false }
          : block,
      );
    }
    message.streamingStart = undefined;
  }
  for (const part of content) {
    const type = part.thought ? 'thought' : 'text';
    const text = part.text || '';
    const previous = message.blocks.at(-1);
    const sameResponse = message.blocks.length > responseStart;
    if (previous?.type === type && sameResponse) {
      message.blocks[message.blocks.length - 1] = {
        type,
        text: previous.text + text,
        streaming: !!event.partial,
      };
    } else {
      if (previous && previous.type !== 'tool' && sameResponse) {
        message.blocks[message.blocks.length - 1] = {
          ...previous,
          streaming: false,
        };
      }
      message.blocks.push({
        type,
        text,
        streaming: !!event.partial,
      });
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
        ...(call.args && { args: call.args }),
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
    streamingStart: undefined,
    blocks: message.blocks.map((block) =>
      block.type !== 'tool'
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
