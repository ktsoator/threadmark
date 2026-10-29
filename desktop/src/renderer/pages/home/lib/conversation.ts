import type {
  AgentEvent,
  AgentPart,
  AgentSession,
} from '../../../../shared/agent/types';

export type ReasoningBlock = {
  type: 'reasoning';
  text: string;
  status: 'thinking' | 'done' | 'stopped';
};

export type MessageBlock =
  | { type: 'text'; text: string; streaming: boolean }
  | ReasoningBlock
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
  // Start of the current model response, replaced by ADK's final snapshot.
  streamStart?: number;
  // The final model response's first block; earlier responses are activity.
  answerStart?: number;
  stopped?: boolean;
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
  const hasOutput = parts.some(
    (part) => part.text || (!event.partial && part.functionCall),
  );
  const responses = parts.flatMap((part) =>
    part.functionResponse ? [part.functionResponse] : [],
  );
  if (!hasOutput && !responses.length && !event.turnComplete) return messages;

  if (event.author === 'user' && !responses.length) {
    const text = parts
      .filter((part) => !part.thought)
      .map((part) => part.text || '')
      .join('');
    if (!text) return messages;
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
        id: event.invocationId
          ? `assistant-${event.invocationId}`
          : event.id || `assistant-${messages.length}`,
        role: 'assistant',
        invocationId: event.invocationId,
        blocks: [],
      };
  if (hasOutput) {
    delete message.answerStart;
    if (event.partial) {
      message.streamStart ??= message.blocks.length;
    } else if (message.streamStart !== undefined) {
      // Replace the entire response, including reasoning that preceded text.
      // Earlier tool rounds in this invocation remain intact.
      message.blocks = message.blocks.slice(0, message.streamStart);
      delete message.streamStart;
    }
    const start = message.streamStart ?? message.blocks.length;
    for (const part of parts) {
      if (part.text) appendText(message.blocks, part, start, !!event.partial);
      if (!event.partial && part.functionCall) {
        finishThinking(message.blocks);
        const call = part.functionCall;
        const id = call.id || `${event.id}-${call.name}`;
        if (
          !message.blocks.some(
            (block) => block.type === 'tool' && block.id === id,
          )
        ) {
          message.blocks.push({
            type: 'tool',
            id,
            name: call.name,
            status: 'running',
          });
        }
      }
    }
    if (
      !event.partial &&
      !parts.some((part) => part.functionCall) &&
      parts.some((part) => !part.thought && part.text)
    ) {
      message.answerStart = start;
    }
  } else if (
    !event.partial &&
    event.turnComplete &&
    message.streamStart !== undefined
  ) {
    // Some adapters close the stream without repeating its content.
    message.blocks = message.blocks.map((block) =>
      block.type === 'text'
        ? { ...block, streaming: false }
        : block.type === 'reasoning' && block.status === 'thinking'
          ? { ...block, status: 'done' }
          : block,
    );
    if (
      message.blocks
        .slice(message.streamStart)
        .some((block) => block.type === 'text')
    ) {
      message.answerStart = message.streamStart;
    }
    delete message.streamStart;
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
  if (!message.blocks.length) return messages;
  return continuing
    ? [...messages.slice(0, -1), message]
    : [...messages, message];
}

export function finishMessages(
  messages: ChatMessage[],
  stopped?: boolean,
): ChatMessage[] {
  return messages.map((message, index) => {
    const finished: ChatMessage = {
      ...message,
      blocks: message.blocks.map((block) =>
        block.type === 'text'
          ? { ...block, streaming: false }
          : block.type === 'reasoning'
            ? {
                ...block,
                status: block.status === 'thinking' ? 'stopped' : block.status,
              }
            : {
                ...block,
                status: block.status === 'running' ? 'stopped' : block.status,
              },
      ),
    };
    if (message.role === 'assistant') {
      finished.stopped =
        message.stopped ||
        message.streamStart !== undefined ||
        message.blocks.some(
          (block) => block.type === 'tool' && block.status === 'running',
        );
      if (stopped !== undefined && index === messages.length - 1) {
        finished.stopped = stopped;
      }
    }
    delete finished.streamStart;
    return finished;
  });
}

export function partitionMessage(message: ChatMessage, active: boolean) {
  if (active || message.answerStart === undefined) {
    return {
      work: message.blocks,
      answer: [] as Extract<MessageBlock, { type: 'text' }>[],
    };
  }
  const final = message.blocks.slice(message.answerStart);
  return {
    work: [
      ...message.blocks.slice(0, message.answerStart),
      ...final.filter((block) => block.type !== 'text'),
    ],
    answer: final.filter((block) => block.type === 'text'),
  };
}

function finishThinking(blocks: MessageBlock[]) {
  const previous = blocks.at(-1);
  if (previous?.type === 'reasoning' && previous.status === 'thinking') {
    blocks[blocks.length - 1] = { ...previous, status: 'done' };
  }
}

function appendText(
  blocks: MessageBlock[],
  part: AgentPart,
  start: number,
  partial: boolean,
) {
  if (!part.text) return;
  if (!part.thought) finishThinking(blocks);
  const previous = blocks.at(-1);
  const merge = blocks.length > start;
  if (part.thought) {
    const text =
      merge && previous?.type === 'reasoning'
        ? previous.text + part.text
        : part.text;
    const block: ReasoningBlock = {
      type: 'reasoning',
      text,
      status: partial ? 'thinking' : 'done',
    };
    if (merge && previous?.type === 'reasoning')
      blocks[blocks.length - 1] = block;
    else blocks.push(block);
  } else {
    const text =
      merge && previous?.type === 'text'
        ? previous.text + part.text
        : part.text;
    const block: MessageBlock = { type: 'text', text, streaming: partial };
    if (merge && previous?.type === 'text') blocks[blocks.length - 1] = block;
    else blocks.push(block);
  }
}

export function sessionMessages(session: AgentSession) {
  return finishMessages((session.events ?? []).reduce(appendEvent, []));
}
