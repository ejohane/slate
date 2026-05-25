const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nativeMarkdown', {
  openFile: () => ipcRenderer.invoke('file:open'),
  openPath: (filePath) => ipcRenderer.invoke('file:openPath', filePath),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  chooseWorkspaceFolder: () => ipcRenderer.invoke('workspace:chooseFolder'),
  openWorkspaceFoldersInNewWindows: () =>
    ipcRenderer.invoke('workspace:openFoldersInNewWindows'),
  listWorkspaceMarkdownFiles: (folderPath) =>
    ipcRenderer.invoke('workspace:listMarkdownFiles', folderPath),
  setDocumentState: (payload) =>
    ipcRenderer.invoke('window:set-document-state', payload),
  getUpdateState: () => ipcRenderer.invoke('updates:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  openLatestRelease: () => ipcRenderer.invoke('updates:open-release-page'),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('updates:state', listener)
    return () => ipcRenderer.removeListener('updates:state', listener)
  },
  setThemeSource: (themeSource) =>
    ipcRenderer.invoke('theme:set-source', themeSource),
  onMenuCommand: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('menu-command', listener)
    return () => ipcRenderer.removeListener('menu-command', listener)
  },
})
