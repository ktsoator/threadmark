import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { createAdkClient } from '../../shared/agent/client';
import { errorInfo } from '../../shared/agent/errors';
import type { RunRequest } from '../../shared/agent/types';

export function registerAgentHandlers() {
  const client = createAdkClient(
    process.env.THREADMARK_API_URL || 'http://127.0.0.1:8090/api',
  );
  const runs = new Map<string, AbortController>();

  function checkSender(event: IpcMainInvokeEvent) {
    if (event.senderFrame !== event.sender.mainFrame) {
      throw new Error('Agent requests must come from the application window.');
    }
  }

  function handle<A extends unknown[], T>(
    channel: string,
    run: (...args: A) => Promise<T>,
  ) {
    ipcMain.handle(channel, async (event, ...args: A) => {
      checkSender(event);
      try {
        return { ok: true, value: await run(...args) };
      } catch (error) {
        return { ok: false, error: errorInfo(error) };
      }
    });
  }
  handle('agent:list-projects', client.listProjects);
  handle('agent:create-project', client.createProject);
  handle('agent:rename-project', client.renameProject);
  handle('agent:delete-project', client.deleteProject);
  handle('agent:list-skills', client.listSkills);
  handle('agent:get-skill', client.getSkill);
  handle('agent:list-sessions', client.listSessions);
  handle('agent:get-session', client.getSession);
  handle('agent:create-session', client.createSession);
  handle('agent:append-message', client.appendMessage);
  handle('agent:generate-title', client.generateTitle);
  handle('agent:rename-session', client.renameSession);
  handle('agent:delete-session', client.deleteSession);
  ipcMain.handle(
    'agent:run',
    async (event, requestId: string, request: RunRequest) => {
      checkSender(event);
      const key = `${event.sender.id}:${requestId}`;
      const controller = new AbortController();
      runs.set(key, controller);
      const abort = () => controller.abort();
      event.sender.once('destroyed', abort);
      event.sender.once('did-start-navigation', abort);
      try {
        await client.run(
          request,
          (item) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send('agent:event', { requestId, event: item });
            }
          },
          controller.signal,
        );
        return {};
      } catch (error) {
        return controller.signal.aborted ? {} : { error: errorInfo(error) };
      } finally {
        runs.delete(key);
        event.sender.removeListener('destroyed', abort);
        event.sender.removeListener('did-start-navigation', abort);
      }
    },
  );
  ipcMain.on('agent:cancel', (event, requestId: string) => {
    runs.get(`${event.sender.id}:${requestId}`)?.abort();
  });
}
