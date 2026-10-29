/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

interface Window {
  agent?: import('./shared/agent/types').AgentBridge;
}
