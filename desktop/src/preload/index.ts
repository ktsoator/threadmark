import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../shared/desktop';
import type { AgentBridge } from '../shared/agent/types';

const agent: AgentBridge = {
  listProjects: () => ipcRenderer.invoke('agent:list-projects'),
  createProject: (options) =>
    ipcRenderer.invoke('agent:create-project', options),
  renameProject: (id, name) =>
    ipcRenderer.invoke('agent:rename-project', id, name),
  deleteProject: (id) => ipcRenderer.invoke('agent:delete-project', id),
  listSkills: (context) => ipcRenderer.invoke('agent:list-skills', context),
  getSkill: (name, context) =>
    ipcRenderer.invoke('agent:get-skill', name, context),
  listSessions: () => ipcRenderer.invoke('agent:list-sessions'),
  getSession: (id) => ipcRenderer.invoke('agent:get-session', id),
  createSession: (options) =>
    ipcRenderer.invoke('agent:create-session', options),
  appendMessage: (id, text) =>
    ipcRenderer.invoke('agent:append-message', id, text),
  renameSession: (id, title) =>
    ipcRenderer.invoke('agent:rename-session', id, title),
  deleteSession: (id, cleanup) =>
    ipcRenderer.invoke('agent:delete-session', id, cleanup),
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

const desktop: DesktopBridge = {
  selectProjectDirectory: () =>
    ipcRenderer.invoke('desktop:select-project-directory'),
};
contextBridge.exposeInMainWorld('desktop', desktop);
