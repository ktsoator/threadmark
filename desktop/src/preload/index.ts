import { contextBridge, ipcRenderer } from 'electron';
import type { AgentBridge } from '../shared/agent/types';

const agent: AgentBridge = {
  listSessions: () => ipcRenderer.invoke('agent:list-sessions'),
  getSession: (id) => ipcRenderer.invoke('agent:get-session', id),
  createSession: (title) => ipcRenderer.invoke('agent:create-session', title),
  renameSession: (id, title) =>
    ipcRenderer.invoke('agent:rename-session', id, title),
  deleteSession: (id) => ipcRenderer.invoke('agent:delete-session', id),
  run: (requestId, request) =>
    ipcRenderer.invoke('agent:run', requestId, request),
  cancelRun: (requestId) => ipcRenderer.send('agent:cancel', requestId),
  onEvent: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      message: Parameters<typeof callback>[0],
    ) => callback(message);
    ipcRenderer.on('agent:event', listener);
    return () => ipcRenderer.removeListener('agent:event', listener);
  },
};

contextBridge.exposeInMainWorld('agent', agent);
