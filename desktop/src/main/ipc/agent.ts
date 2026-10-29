import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { createAdkClient } from '../../shared/agent/client';
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

  ipcMain.handle('agent:list-sessions', (event) => {
    checkSender(event);
    return client.listSessions();
  });
  ipcMain.handle('agent:get-session', (event, id: string) => {
    checkSender(event);
    return client.getSession(id);
  });
  ipcMain.handle('agent:create-session', (event, title: string) => {
    checkSender(event);
    return client.createSession(title);
  });
  ipcMain.handle('agent:rename-session', (event, id: string, title: string) => {
    checkSender(event);
    return client.renameSession(id, title);
  });
  ipcMain.handle('agent:delete-session', (event, id: string) => {
    checkSender(event);
    return client.deleteSession(id);
  });
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
        return controller.signal.aborted
          ? {}
          : {
              error:
                error instanceof Error
                  ? error.message
                  : 'The agent request failed.',
            };
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
