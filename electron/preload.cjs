const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('nativeMarkdown', {
  openFile: () => ipcRenderer.invoke('file:open'),
  openPath: (filePath) => ipcRenderer.invoke('file:openPath', filePath),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  chooseWorkspaceFolder: () => ipcRenderer.invoke('workspace:chooseFolder'),
  listWorkspaceMarkdownFiles: (folderPath) =>
    ipcRenderer.invoke('workspace:listMarkdownFiles', folderPath),
  setDocumentState: (payload) =>
    ipcRenderer.invoke('window:set-document-state', payload),
  onMenuCommand: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('menu-command', listener)
    return () => ipcRenderer.removeListener('menu-command', listener)
  },
})
