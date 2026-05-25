const { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const devServerUrl = process.env.ELECTRON_START_URL
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

app.setName('Slate')

function createWindow() {
  mainWindow = new BrowserWindow({
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

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function sendMenuCommand(command) {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow
  window?.webContents.send('menu-command', command)
}

function createMenu() {
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
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
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendMenuCommand('open'),
        },
        {
          label: 'Open Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
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
      label: 'Window',
      submenu:
        process.platform === 'darwin'
          ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
          : [{ role: 'minimize' }, { role: 'close' }],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

ipcMain.handle('file:open', async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow
  const result = await dialog.showOpenDialog(window, {
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

ipcMain.handle('workspace:chooseFolder', async () => {
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow
  const result = await dialog.showOpenDialog(window, {
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

ipcMain.handle('workspace:listMarkdownFiles', async (_event, folderPath) => {
  if (!folderPath) return []
  return listMarkdownFiles(folderPath)
})

ipcMain.handle('file:save', async (_event, { filePath, suggestedName, text }) => {
  let targetPath = filePath
  const window = BrowserWindow.getFocusedWindow() ?? mainWindow

  if (!targetPath) {
    const result = await dialog.showSaveDialog(window, {
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
