const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  shell,
} = require('electron')
const { autoUpdater } = require('electron-updater')
const fs = require('node:fs/promises')
const path = require('node:path')

const devServerUrl = process.env.ELECTRON_START_URL
const githubOwner = 'ejohane'
const githubRepo = 'slate'
const releasePageUrl = `https://github.com/${githubOwner}/${githubRepo}/releases/latest`
const markdownExtensions = new Set(['.md', '.markdown', '.mdown', '.mkd'])
const excludedWorkspaceDirectories = new Set([
  '.cache',
  '.git',
  '.hg',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.vercel',
  '.vite',
  '.vscode',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
])
const maxWorkspaceFiles = 5000

let mainWindow = null
let updateState = {
  currentVersion: app.getVersion(),
  isPackaged: app.isPackaged,
  status: 'idle',
  availableVersion: null,
  downloadedVersion: null,
  progress: null,
  error: null,
  releasePageUrl,
}

app.setName('Slate')
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.setFeedURL({
  provider: 'github',
  owner: githubOwner,
  repo: githubRepo,
})

function createWindow(options = {}) {
  const window = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#ffffff',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: false,
    },
  })

  if (!mainWindow) {
    mainWindow = window
  }

  window.once('ready-to-show', () => {
    window.show()
  })

  if (devServerUrl) {
    const url = new URL(devServerUrl)
    if (options.workspacePath) {
      url.searchParams.set('workspacePath', options.workspacePath)
    }
    window.loadURL(url.toString())
  } else {
    window.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: options.workspacePath ? { workspacePath: options.workspacePath } : {},
    })
  }

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = BrowserWindow.getAllWindows()[0] ?? null
    }
  })

  return window
}

function sendMenuCommand(command) {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow
  window?.webContents.send('menu-command', command)
}

function getDialogParentWindow(event) {
  if (event) {
    const eventWindow = BrowserWindow.fromWebContents(event.sender)
    if (eventWindow) return eventWindow
  }

  return BrowserWindow.getFocusedWindow() ?? mainWindow
}

function showOpenDialog(parentWindow, options) {
  return parentWindow
    ? dialog.showOpenDialog(parentWindow, options)
    : dialog.showOpenDialog(options)
}

function showSaveDialog(parentWindow, options) {
  return parentWindow
    ? dialog.showSaveDialog(parentWindow, options)
    : dialog.showSaveDialog(options)
}

async function chooseWorkspaceFolders(parentWindow) {
  const result = await showOpenDialog(parentWindow, {
    properties: ['openDirectory', 'multiSelections'],
  })

  if (result.canceled || result.filePaths.length === 0) return []
  return result.filePaths
}

async function openWorkspaceWindowsFromDialog(parentWindow) {
  const folderPaths = await chooseWorkspaceFolders(parentWindow)

  for (const folderPath of folderPaths) {
    createWindow({ workspacePath: folderPath })
  }

  return folderPaths.length
}

function createMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              {
                label: 'Check for Updates...',
                click: () => sendMenuCommand('updates'),
              },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => createWindow(),
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            void openWorkspaceWindowsFromDialog(BrowserWindow.getFocusedWindow() ?? mainWindow)
          },
        },
        { type: 'separator' },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuCommand('open'),
        },
        {
          label: 'Switch Folder in This Window...',
          click: () => sendMenuCommand('openFolder'),
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendMenuCommand('save'),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => sendMenuCommand('saveAs'),
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+K',
          click: () => sendMenuCommand('palette'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => sendMenuCommand('updates'),
        },
        {
          label: 'Open Downloads Page',
          click: () => shell.openExternal(releasePageUrl),
        },
      ],
    },
    {
      label: 'Window',
      submenu:
        process.platform === 'darwin'
          ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
          : [{ role: 'minimize' }, { role: 'close' }],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle('file:open', async (event) => {
  const window = getDialogParentWindow(event)
  const result = await showOpenDialog(window, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const text = await fs.readFile(filePath, 'utf8')
  return {
    name: path.basename(filePath),
    path: filePath,
    text,
    workspacePath: await findWorkspaceRoot(filePath),
  }
})

ipcMain.handle('file:openPath', async (_event, filePath) => {
  if (!filePath) return null

  const text = await fs.readFile(filePath, 'utf8')
  return {
    name: path.basename(filePath),
    path: filePath,
    text,
    workspacePath: await findWorkspaceRoot(filePath),
  }
})

ipcMain.handle('workspace:chooseFolder', async (event) => {
  const window = getDialogParentWindow(event)
  const result = await showOpenDialog(window, {
    properties: ['openDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const folderPath = result.filePaths[0]
  return {
    name: path.basename(folderPath),
    path: folderPath,
    files: await listMarkdownFiles(folderPath),
  }
})

ipcMain.handle('workspace:openFoldersInNewWindows', async (event) => {
  return openWorkspaceWindowsFromDialog(getDialogParentWindow(event))
})

ipcMain.handle('workspace:listMarkdownFiles', async (_event, folderPath) => {
  if (!folderPath) return []
  return listMarkdownFiles(folderPath)
})

ipcMain.handle('file:save', async (event, { filePath, suggestedName, text }) => {
  let targetPath = filePath
  const window = getDialogParentWindow(event)

  if (!targetPath) {
    const result = await showSaveDialog(window, {
      defaultPath: suggestedName || 'untitled.md',
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    })

    if (result.canceled || !result.filePath) return null
    targetPath = result.filePath
  }

  await fs.writeFile(targetPath, text, 'utf8')
  return {
    name: path.basename(targetPath),
    path: targetPath,
  }
})

ipcMain.handle('window:set-document-state', (event, { edited, filePath, title }) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return

  window.setDocumentEdited(Boolean(edited))
  window.setTitle(title || 'Slate')

  if (process.platform === 'darwin' && filePath) {
    window.setRepresentedFilename(filePath)
  }
})

ipcMain.handle('updates:get-state', () => getUpdateState())

ipcMain.handle('updates:check', () => checkForUpdates({ manual: true }))

ipcMain.handle('updates:download', () => downloadUpdate())

ipcMain.handle('updates:install', () => installUpdate())

ipcMain.handle('updates:open-release-page', () => shell.openExternal(releasePageUrl))

ipcMain.handle('theme:set-source', (_event, themeSource) => {
  if (!['system', 'light', 'dark'].includes(themeSource)) return

  nativeTheme.themeSource = themeSource
  const backgroundColor = nativeTheme.shouldUseDarkColors ? '#0b0b0b' : '#ffffff'

  for (const window of BrowserWindow.getAllWindows()) {
    window.setBackgroundColor(backgroundColor)
  }
})

app.whenReady().then(() => {
  createMenu()
  createWindow()
  configureUpdaterEvents()

  setTimeout(() => {
    void checkForUpdates({ manual: false })
  }, 3500)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

async function findWorkspaceRoot(filePath) {
  let current = path.dirname(filePath)
  const root = path.parse(current).root

  while (current && current !== root) {
    try {
      const stats = await fs.stat(path.join(current, '.git'))
      if (stats.isDirectory() || stats.isFile()) return current
    } catch {
      // Keep walking upward until a Git root is found.
    }

    current = path.dirname(current)
  }

  return path.dirname(filePath)
}

async function listMarkdownFiles(folderPath) {
  const files = []

  async function visit(directory) {
    if (files.length >= maxWorkspaceFiles) return

    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (files.length >= maxWorkspaceFiles) return
      if (entry.name.startsWith('.') && entry.name !== '.github') {
        if (entry.isDirectory()) continue
      }

      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        if (excludedWorkspaceDirectories.has(entry.name)) continue
        await visit(entryPath)
        continue
      }

      if (!entry.isFile()) continue
      if (!markdownExtensions.has(path.extname(entry.name).toLowerCase())) continue

      files.push({
        name: entry.name,
        path: entryPath,
        relativePath: path.relative(folderPath, entryPath),
      })
    }
  }

  await visit(folderPath)
  return files
}

function configureUpdaterEvents() {
  autoUpdater.on('checking-for-update', () => {
    setUpdateState({
      status: 'checking',
      progress: null,
      error: null,
    })
  })

  autoUpdater.on('update-available', (info) => {
    setUpdateState({
      status: 'available',
      availableVersion: info.version,
      downloadedVersion: null,
      progress: null,
      error: null,
    })
    notifyUpdateAvailable(info.version)
  })

  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      status: 'not-available',
      availableVersion: null,
      downloadedVersion: null,
      progress: null,
      error: null,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    setUpdateState({
      status: 'downloading',
      progress: Math.round(progress.percent),
      error: null,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    setUpdateState({
      status: 'downloaded',
      downloadedVersion: info.version,
      availableVersion: info.version,
      progress: 100,
      error: null,
    })
  })

  autoUpdater.on('error', (error) => {
    setUpdateState({
      status: 'error',
      progress: null,
      error: getErrorMessage(error),
    })
  })
}

function getUpdateState() {
  return {
    ...updateState,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
  }
}

function setUpdateState(patch) {
  updateState = {
    ...updateState,
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    ...patch,
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('updates:state', getUpdateState())
  }
}

async function checkForUpdates({ manual }) {
  if (!app.isPackaged) {
    setUpdateState({
      status: 'idle',
      progress: null,
      error: manual ? 'Update checks run in packaged builds.' : null,
    })
    return getUpdateState()
  }

  try {
    setUpdateState({
      status: 'checking',
      progress: null,
      error: null,
    })
    await autoUpdater.checkForUpdates()
  } catch (error) {
    setUpdateState({
      status: 'error',
      progress: null,
      error: getErrorMessage(error),
    })
  }

  return getUpdateState()
}

async function downloadUpdate() {
  if (!app.isPackaged) {
    setUpdateState({
      status: 'idle',
      error: 'Update downloads run in packaged builds.',
    })
    return getUpdateState()
  }

  try {
    setUpdateState({
      status: 'downloading',
      progress: 0,
      error: null,
    })
    await autoUpdater.downloadUpdate()
  } catch (error) {
    setUpdateState({
      status: 'error',
      progress: null,
      error: getErrorMessage(error),
    })
  }

  return getUpdateState()
}

function installUpdate() {
  if (updateState.status !== 'downloaded') {
    setUpdateState({
      error: 'Download an update before installing.',
    })
    return getUpdateState()
  }

  autoUpdater.quitAndInstall(false, true)
  return getUpdateState()
}

function notifyUpdateAvailable(version) {
  if (!Notification.isSupported()) return

  new Notification({
    title: 'Slate update available',
    body: `Version ${version} is ready to download.`,
  }).show()
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message
  return String(error)
}
