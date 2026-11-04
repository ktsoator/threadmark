/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />
declare module '*.css';

interface Window {
  desktop?: import('./shared/desktop').DesktopBridge;
  agent?: import('./shared/agent/types').AgentBridge;
}
