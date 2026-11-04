export const canSelectDirectory = () => !!window.desktop;
export const selectProjectDirectory = () => {
  if (!window.desktop)
    throw new Error('Folder selection is available in the desktop app.');
  return window.desktop.selectProjectDirectory();
};
