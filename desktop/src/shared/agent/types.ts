export type AgentPart = {
  text?: string;
  thought?: boolean;
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: {
    id?: string;
    name: string;
    response?: Record<string, unknown>;
  };
};

export type AgentEvent = {
  id?: string;
  author?: string;
  invocationId?: string;
  partial?: boolean;
  turnComplete?: boolean;
  errorCode?: string;
  errorMessage?: string;
  content?: { role?: string; parts?: AgentPart[] } | null;
  actions?: { compaction?: unknown };
};

export type AgentSession = {
  id: string;
  lastUpdateTime: number;
  events: AgentEvent[];
  state: {
    __session_metadata__?: { displayName?: string };
    [key: string]: unknown;
  };
};

export type RunRequest = { sessionId: string; text: string };

export type AgentBridge = {
  listSessions: () => Promise<AgentSession[]>;
  getSession: (id: string) => Promise<AgentSession>;
  createSession: (title: string) => Promise<AgentSession>;
  run: (requestId: string, request: RunRequest) => Promise<{ error?: string }>;
  cancelRun: (requestId: string) => void;
  onEvent: (
    callback: (message: { requestId: string; event: AgentEvent }) => void,
  ) => () => void;
};
