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
  title: string;
  titleSource: 'none' | 'generated' | 'manual';
  projectId: string | null;
  managedDirectory: string | null;
  lastUpdateTime: number;
  events: AgentEvent[];
  state: {
    __session_metadata__?: {
      displayName?: string;
      kind?: 'freechat';
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
};

export type RunRequest = { sessionId: string; text: string };

export type SkillSummary = {
  name: string;
  description: string;
};

export type SkillDetail = SkillSummary & {
  instructions: string;
};

export type Project = {
  id: string;
  name: string;
  directory: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatKind = 'chat' | 'freechat';
export type CreateSessionOptions = {
  title: string;
  kind?: ChatKind;
  projectId?: string;
};
export type CreateProjectOptions = { name?: string; directory: string };
export type SkillContext =
  | { sessionId: string; projectId?: never }
  | { projectId: string; sessionId?: never };
export type DeleteSessionResult = {
  deleted: boolean;
  workspaceCleanup:
    | 'retained'
    | 'deleted'
    | 'failed'
    | 'notApplicable'
    | 'notAttempted';
  retainedPath?: string;
  warning?: string;
};
export type ServiceErrorInfo = {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
};
export type IPCResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ServiceErrorInfo };
export type AgentAPI = {
  listProjects: () => Promise<Project[]>;
  createProject: (options: CreateProjectOptions) => Promise<Project>;
  renameProject: (id: string, name: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  listSkills: (context?: SkillContext) => Promise<SkillSummary[]>;
  getSkill: (name: string, context?: SkillContext) => Promise<SkillDetail>;
  listSessions: () => Promise<AgentSession[]>;
  getSession: (id: string) => Promise<AgentSession>;
  createSession: (options: CreateSessionOptions) => Promise<AgentSession>;
  appendMessage: (id: string, text: string) => Promise<AgentSession>;
  generateTitle: (text: string) => Promise<string>;
  renameSession: (
    id: string,
    title: string,
    source?: 'generated' | 'manual',
  ) => Promise<AgentSession>;
  deleteSession: (
    id: string,
    deleteWorkspace?: boolean,
  ) => Promise<DeleteSessionResult>;
};
export type AgentBridge = {
  [K in keyof AgentAPI]: (
    ...args: Parameters<AgentAPI[K]>
  ) => Promise<IPCResult<Awaited<ReturnType<AgentAPI[K]>>>>;
} & {
  run: (
    requestId: string,
    request: RunRequest,
  ) => Promise<{ error?: ServiceErrorInfo }>;
  cancelRun: (requestId: string) => void;
  onEvent: (
    callback: (message: { requestId: string; event: AgentEvent }) => void,
  ) => () => void;
};
