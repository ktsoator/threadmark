import { BrowserWindow, dialog, ipcMain } from 'electron';

export function registerFolderHandlers() {
  ipcMain.handle('desktop:select-project-directory', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || event.senderFrame !== event.sender.mainFrame) {
      throw new Error(
        'Folder selection must come from the application window.',
      );
    }
    const result = await dialog.showOpenDialog(owner, {
      title: 'Choose project folder',
      buttonLabel: 'Choose folder',
      properties: ['openDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });
}
