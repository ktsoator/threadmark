export type DesktopBridge = {
  selectProjectDirectory: () => Promise<string | null>;
};
