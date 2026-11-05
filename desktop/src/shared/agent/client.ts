import { createParser } from 'eventsource-parser';
import type {
  AgentEvent,
  AgentSession,
  RunRequest,
  SkillDetail,
  SkillSummary,
  SkillContext,
  CreateSessionOptions,
  CreateProjectOptions,
  Project,
  DeleteSessionResult,
  ModelList,
  ModelSelection,
} from './types';

import { errorInfo, interruptedStream, ServiceError } from './errors';

const appName = 'assistant';
const userId = 'desktop-user';
const sessionsPath = `/apps/${appName}/users/${userId}/sessions`;

const projectsPath = `/apps/${appName}/users/${userId}/projects`;

function skillQuery(context?: SkillContext) {
  if (!context) return '';
  return (
    '?' +
    new URLSearchParams({
      appName,
      userId,
      ...(context.sessionId
        ? { sessionId: context.sessionId }
        : { projectId: context.projectId! }),
    })
  );
}

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
      throw new ServiceError(
        {
          code: 'SERVICE_UNAVAILABLE',
          message:
            'Cannot reach the agent service. Check that it is running on port 8090.',
        },
        { cause: error },
      );
    }
    if (!response.ok) {
      const body = (await response.text()).trim();
      let detail = body.slice(0, 400);
      let code: string | undefined;
      let details: Record<string, unknown> | undefined;
      try {
        const data = JSON.parse(body);
        if (typeof data.error === 'string') detail = data.error.slice(0, 400);
        if (typeof data.code === 'string') code = data.code;
        if (data.details && typeof data.details === 'object')
          details = data.details;
      } catch {
        // ADK endpoints can return plain-text errors.
      }
      throw new ServiceError({
        message:
          detail || `The agent service returned HTTP ${response.status}.`,
        code,
        details,
      });
    }
    return response;
  }

  return {
    async listModels(): Promise<ModelList> {
      return (await request('/models')).json();
    },
    async listProjects(): Promise<Project[]> {
      return (await request(projectsPath)).json();
    },
    async createProject(options: CreateProjectOptions): Promise<Project> {
      return (
        await request(projectsPath, {
          method: 'POST',
          body: JSON.stringify(options),
        })
      ).json();
    },
    async renameProject(id: string, name: string): Promise<Project> {
      return (
        await request(`${projectsPath}/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ name }),
        })
      ).json();
    },
    async deleteProject(id: string): Promise<void> {
      await request(`${projectsPath}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    },
    async listSkills(context?: SkillContext): Promise<SkillSummary[]> {
      const data: { skills: SkillSummary[] } = await (
        await request('/skills' + skillQuery(context))
      ).json();
      return data.skills;
    },
    async getSkill(name: string, context?: SkillContext): Promise<SkillDetail> {
      return (
        await request(
          `/skills/${encodeURIComponent(name)}${skillQuery(context)}`,
        )
      ).json();
    },
    async listSessions(): Promise<AgentSession[]> {
      return (await request(sessionsPath)).json();
    },
    async getSession(id: string): Promise<AgentSession> {
      return (
        await request(`${sessionsPath}/${encodeURIComponent(id)}`)
      ).json();
    },
    async createSession({
      title,
      kind,
      projectId,
    }: CreateSessionOptions): Promise<AgentSession> {
      return (
        await request(sessionsPath, {
          method: 'POST',
          body: JSON.stringify({
            title,
            projectId,
            state: {
              __session_metadata__: {
                kind: kind === 'freechat' ? kind : undefined,
              },
            },
          }),
        })
      ).json();
    },
    async appendMessage(id: string, text: string): Promise<AgentSession> {
      return (
        await request(`${sessionsPath}/${encodeURIComponent(id)}/messages`, {
          method: 'POST',
          body: JSON.stringify({ text }),
        })
      ).json();
    },
    async generateTitle(text: string, model?: ModelSelection): Promise<string> {
      const data: { title: string } = await (
        await request('/title', {
          method: 'POST',
          body: JSON.stringify({ text, model }),
          signal: AbortSignal.timeout(20_000),
        })
      ).json();
      const title = data.title?.trim();
      if (!title) throw new Error('The agent service returned an empty title.');
      return title;
    },
    async renameSession(
      id: string,
      title: string,
      source: 'generated' | 'manual' = 'manual',
    ): Promise<AgentSession> {
      title = title.trim();
      if (!title) throw new Error('Enter a conversation name.');
      const path = `${sessionsPath}/${encodeURIComponent(id)}`;
      return (
        await request(path, {
          method: 'PATCH',
          body: JSON.stringify({ title, titleSource: source }),
        })
      ).json();
    },
    async deleteSession(
      id: string,
      deleteWorkspace = false,
    ): Promise<DeleteSessionResult> {
      return (
        await request(
          `${sessionsPath}/${encodeURIComponent(id)}?deleteWorkspace=${deleteWorkspace}`,
          { method: 'DELETE' },
        )
      ).json();
    },
    async run(
      { sessionId, text, model }: RunRequest,
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
          model,
        }),
        signal,
      });
      if (
        !response.body ||
        !response.headers.get('content-type')?.includes('text/event-stream')
      ) {
        throw new Error('The agent service did not return a message stream.');
      }

      let completed = false;
      const parser = createParser({
        onEvent(message) {
          if (completed) return;
          if (message.event === 'done') {
            completed = true;
            return;
          }
          if (message.data === '[DONE]') return;
          const event: AgentEvent & { error?: string; code?: string } =
            JSON.parse(message.data);
          if (
            message.event === 'error' ||
            event.error ||
            event.errorCode ||
            event.errorMessage
          ) {
            throw new ServiceError({
              message:
                event.error ||
                event.errorMessage ||
                event.errorCode ||
                'The agent could not finish its reply.',
              code: event.code || event.errorCode || 'RUN_FAILED',
            });
          }
          onEvent(event);
        },
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (!completed) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }
        parser.feed(decoder.decode());
        signal.throwIfAborted();
        if (!completed) throw interruptedStream();
      } catch (error) {
        if (signal.aborted) throw error;
        const failure =
          error instanceof ServiceError ? error : interruptedStream(error);
        console.error('Agent stream failed', {
          sessionId,
          ...errorInfo(failure),
        });
        throw failure;
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    },
  };
}
