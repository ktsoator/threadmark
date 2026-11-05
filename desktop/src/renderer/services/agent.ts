import { createAdkClient } from '../../shared/agent/client';
import { ServiceError } from '../../shared/agent/errors';
import type {
  AgentEvent,
  CreateProjectOptions,
  CreateSessionOptions,
  IPCResult,
  RunRequest,
  SkillContext,
  ModelSelection,
} from '../../shared/agent/types';

const browserClient = createAdkClient('/api');

function request<T>(
  native: Promise<IPCResult<T>> | undefined,
  browser: () => Promise<T>,
): Promise<T> {
  if (!native) return browser();
  return native.then((result) => {
    if (!result.ok) throw new ServiceError(result.error);
    return result.value;
  });
}
export const listModels = () =>
  request(window.agent?.listModels(), () => browserClient.listModels());
export const listProjects = () =>
  request(window.agent?.listProjects(), () => browserClient.listProjects());
export const createProject = (options: CreateProjectOptions) =>
  request(window.agent?.createProject(options), () =>
    browserClient.createProject(options),
  );
export const renameProject = (id: string, name: string) =>
  request(window.agent?.renameProject(id, name), () =>
    browserClient.renameProject(id, name),
  );
export const deleteProject = (id: string) =>
  request(window.agent?.deleteProject(id), () =>
    browserClient.deleteProject(id),
  );
export const listSkills = (context?: SkillContext) =>
  request(window.agent?.listSkills(context), () =>
    browserClient.listSkills(context),
  );
export const getSkill = (name: string, context?: SkillContext) =>
  request(window.agent?.getSkill(name, context), () =>
    browserClient.getSkill(name, context),
  );
export const listSessions = () =>
  request(window.agent?.listSessions(), () => browserClient.listSessions());
export const getSession = (id: string) =>
  request(window.agent?.getSession(id), () => browserClient.getSession(id));
export const createSession = (options: CreateSessionOptions) =>
  request(window.agent?.createSession(options), () =>
    browserClient.createSession(options),
  );
export const appendMessage = (id: string, text: string) =>
  request(window.agent?.appendMessage(id, text), () =>
    browserClient.appendMessage(id, text),
  );
export const generateTitle = (text: string, model?: ModelSelection) =>
  request(window.agent?.generateTitle(text, model), () =>
    browserClient.generateTitle(text, model),
  );
export const renameSession = (
  id: string,
  title: string,
  source: 'generated' | 'manual' = 'manual',
) =>
  request(window.agent?.renameSession(id, title, source), () =>
    browserClient.renameSession(id, title, source),
  );

const activeRuns = new Map<
  string,
  Set<{ abort: () => void; done: Promise<void> }>
>();
export async function deleteSession(id: string, cleanup = false) {
  const runs = [...(activeRuns.get(id) ?? [])];
  runs.forEach((run) => run.abort());
  await Promise.all(runs.map((run) => run.done));
  return request(window.agent?.deleteSession(id, cleanup), () =>
    browserClient.deleteSession(id, cleanup),
  );
}

export async function runAgent(
  input: RunRequest,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  let finish!: () => void;
  const running = {
    abort,
    done: new Promise<void>((resolve) => {
      finish = resolve;
    }),
  };
  const runs = activeRuns.get(input.sessionId) ?? new Set();
  runs.add(running);
  activeRuns.set(input.sessionId, runs);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    await stream(input, onEvent, controller.signal);
  } finally {
    signal.removeEventListener('abort', abort);
    runs.delete(running);
    if (!runs.size) activeRuns.delete(input.sessionId);
    finish();
  }
}

async function stream(
  input: RunRequest,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (!window.agent) return browserClient.run(input, onEvent, signal);
  const bridge = window.agent;
  const requestId = crypto.randomUUID();
  const unsubscribe = bridge.onEvent((message) => {
    if (message.requestId === requestId && !signal.aborted)
      onEvent(message.event);
  });
  const cancel = () => bridge.cancelRun(requestId);
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await bridge.run(requestId, input);
    signal.throwIfAborted();
    if (result.error) throw new ServiceError(result.error);
  } finally {
    signal.removeEventListener('abort', cancel);
    unsubscribe();
  }
}
