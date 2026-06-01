import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bold,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  Info,
  Italic,
  Monitor,
  Moon,
  MoreVertical,
  PanelLeft,
  RefreshCw,
  RotateCw,
  Search,
  Sun,
  Underline,
  X,
} from 'lucide-react'
import './App.css'
import { HybridMarkdownEditor } from './components/HybridMarkdownEditor'
import { countWords } from './core/markdownBlocks'
import {
  canUseFilePicker,
  canUseNativeFileSystem,
  chooseWorkspaceFolder,
  listWorkspaceMarkdownFiles,
  openMarkdownFile,
  openMarkdownFilePath,
  saveMarkdownFile,
  saveMarkdownFileAs,
  type MarkdownFile,
  type WorkspaceFile,
  type WorkspaceFolder,
} from './core/fileAccess'
import type { NativeUpdateState } from './electron'

type RecentMarkdownFile = {
  name: string
  path: string
  touchedAt: number
}

type ThemePreference = 'system' | 'light' | 'dark'

const legacyRecentFilesKey = 'personal-markdown-editor.recentFiles'
const legacyWorkspaceKey = 'personal-markdown-editor.workspace'
const recentFilesKey = 'slate.recentFiles'
const workspaceKey = 'slate.workspace'
const themeKey = 'slate.theme'
const maxPaletteResults = 30

const themeOptions = [
  { value: 'system', label: 'Use system theme', Icon: Monitor },
  { value: 'light', label: 'Use light theme', Icon: Sun },
  { value: 'dark', label: 'Use dark theme', Icon: Moon },
] as const

const starterMarkdown = `# Friday notes

Keep the writing surface quiet. The file should stay portable, readable, and easy to move.

- Favor fast typing over decorative chrome.
- Keep one Markdown string as the source of truth.
- Make extensions small enough to understand.

## Extension sketch

Renderer plugins and editor commands can share one lightweight shape.

\`\`\`ts
type Plugin = {
  name: string
  configureMarkdown?: (md: MarkdownIt) => void
}
\`\`\`

The best version of this still feels like opening a text file.`

function App() {
  const [markdown, setMarkdown] = useState(starterMarkdown)
  const [file, setFile] = useState<MarkdownFile>({
    name: 'untitled.md',
    handle: null,
    path: null,
  })
  const [lastSaved, setLastSaved] = useState(starterMarkdown)
  const [isNavOpen, setIsNavOpen] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [highlightedPaletteIndex, setHighlightedPaletteIndex] = useState(0)
  const [recentFiles, setRecentFiles] = useState<RecentMarkdownFile[]>(() =>
    readRecentFiles(),
  )
  const [workspace, setWorkspace] = useState<WorkspaceFolder | null>(() =>
    readInitialWorkspace(),
  )
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    readThemePreference(),
  )
  const [status, setStatus] = useState(() => {
    const initialWorkspace = readInitialWorkspace()
    return initialWorkspace ? `Workspace ${initialWorkspace.name}` : 'Local draft'
  })
  const [isUpdatesOpen, setIsUpdatesOpen] = useState(false)
  const [updateState, setUpdateState] = useState<NativeUpdateState | null>(null)
  const fallbackInputRef = useRef<HTMLInputElement | null>(null)
  const paletteInputRef = useRef<HTMLInputElement | null>(null)

  const wordCount = useMemo(() => countWords(markdown), [markdown])
  const isDirty = markdown !== lastSaved
  const paletteItems = useMemo(() => {
    const query = paletteQuery.trim().toLowerCase()
    const files = workspaceFiles
      .filter((workspaceFile) => {
        if (!query) return true
        return workspaceFile.name.toLowerCase().includes(query)
      })
      .sort((a, b) => {
        if (!query) return a.relativePath.localeCompare(b.relativePath)

        const aName = a.name.toLowerCase()
        const bName = b.name.toLowerCase()
        const aStarts = aName.startsWith(query)
        const bStarts = bName.startsWith(query)

        if (aStarts !== bStarts) return aStarts ? -1 : 1
        return a.relativePath.localeCompare(b.relativePath)
      })
      .slice(0, maxPaletteResults)
      .map((workspaceFile) => ({ type: 'file' as const, file: workspaceFile }))

    return [{ type: 'folder' as const }, ...files]
  }, [paletteQuery, workspaceFiles])

  const addRecentFile = useCallback((nextFile: MarkdownFile) => {
    if (!nextFile.path) return

    setRecentFiles((current) => {
      const next = [
        {
          name: nextFile.name,
          path: nextFile.path as string,
          touchedAt: Date.now(),
        },
        ...current.filter((item) => item.path !== nextFile.path),
      ].slice(0, 12)

      writeRecentFiles(next)
      return next
    })
  }, [])

  const applyOpenedFile = useCallback(
    (opened: MarkdownFile & { text: string }, nextStatus: string) => {
      setFile({ name: opened.name, handle: opened.handle, path: opened.path })
      setMarkdown(opened.text)
      setLastSaved(opened.text)
      setStatus(nextStatus)
      addRecentFile(opened)

      if (opened.workspacePath) {
        const nextWorkspace = {
          name: getPathName(opened.workspacePath),
          path: opened.workspacePath,
        }
        setWorkspace(nextWorkspace)
        writeWorkspace(nextWorkspace)
        void listWorkspaceMarkdownFiles(opened.workspacePath).then((files) => {
          setWorkspaceFiles(files)
        })
      }
    },
    [addRecentFile],
  )

  const onChooseWorkspace = useCallback(async () => {
    if (!window.nativeMarkdown) {
      setStatus('Folder search requires the desktop app')
      return
    }

    try {
      const nextWorkspace = await chooseWorkspaceFolder()
      if (!nextWorkspace) return

      setWorkspace(nextWorkspace.folder)
      setWorkspaceFiles(nextWorkspace.files)
      writeWorkspace(nextWorkspace.folder)
      setStatus(`Workspace ${nextWorkspace.folder.name}`)
      setHighlightedPaletteIndex(0)
      window.requestAnimationFrame(() => paletteInputRef.current?.focus())
    } catch {
      setStatus('Open folder failed')
    }
  }, [])

  const onOpen = useCallback(async () => {
    if (isDirty && !window.confirm('Open another file and discard unsaved edits?')) {
      return
    }

    if (!canUseFilePicker()) {
      fallbackInputRef.current?.click()
      return
    }

    try {
      const opened = await openMarkdownFile()
      if (!opened) return
      applyOpenedFile(opened, `Opened ${opened.name}`)
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        setStatus('Open failed')
      }
    }
  }, [applyOpenedFile, isDirty])

  const onOpenRecent = useCallback(
    async (recentFile: RecentMarkdownFile) => {
      if (isDirty && !window.confirm('Open another file and discard unsaved edits?')) {
        return
      }

      try {
        const opened = await openMarkdownFilePath(recentFile.path)
        if (!opened) return
        applyOpenedFile(opened, `Opened ${opened.name}`)
      } catch {
        setStatus(`Could not open ${recentFile.name}`)
        setRecentFiles((current) => {
          const next = current.filter((item) => item.path !== recentFile.path)
          writeRecentFiles(next)
          return next
        })
      }
    },
    [applyOpenedFile, isDirty],
  )

  const onOpenWorkspaceFile = useCallback(
    async (workspaceFile: WorkspaceFile) => {
      if (isDirty && !window.confirm('Open another file and discard unsaved edits?')) {
        return
      }

      try {
        const opened = await openMarkdownFilePath(workspaceFile.path)
        if (!opened) return
        applyOpenedFile(opened, `Opened ${opened.name}`)
        setIsPaletteOpen(false)
        setPaletteQuery('')
        setHighlightedPaletteIndex(0)
      } catch {
        setStatus(`Could not open ${workspaceFile.name}`)
      }
    },
    [applyOpenedFile, isDirty],
  )

  const openPalette = useCallback(() => {
    setIsPaletteOpen(true)
    setHighlightedPaletteIndex(0)
  }, [])

  const closePalette = useCallback(() => {
    setIsPaletteOpen(false)
    setPaletteQuery('')
    setHighlightedPaletteIndex(0)
  }, [])

  const runPaletteItem = useCallback(
    (index: number) => {
      const item = paletteItems[index]
      if (!item) return

      if (item.type === 'folder') {
        void onChooseWorkspace()
        return
      }

      void onOpenWorkspaceFile(item.file)
    },
    [onChooseWorkspace, onOpenWorkspaceFile, paletteItems],
  )

  const onFallbackOpen = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = event.target.files?.[0]
      event.target.value = ''
      if (!picked) return

      const text = await picked.text()
      applyOpenedFile(
        { name: picked.name, handle: null, path: null, text },
        `Opened ${picked.name}`,
      )
    },
    [applyOpenedFile],
  )

  const onSave = useCallback(async () => {
    try {
      const saved = await saveMarkdownFile(markdown, file)
      if (!saved) return
      if (!saved.handle && saved.downloaded) {
        setStatus(`Downloaded ${saved.name}`)
        return
      }
      setFile(saved)
      addRecentFile(saved)
      setLastSaved(markdown)
      setStatus(`Saved ${saved.name}`)
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        setStatus('Save failed')
      }
    }
  }, [addRecentFile, file, markdown])

  const onSaveAs = useCallback(async () => {
    try {
      const saved = await saveMarkdownFileAs(markdown, file.name)
      if (!saved) return
      setFile(saved)
      addRecentFile(saved)
      setLastSaved(markdown)
      setStatus(`Saved ${saved.name}`)
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        setStatus('Save failed')
      }
    }
  }, [addRecentFile, file.name, markdown])

  const openUpdates = useCallback(() => {
    setIsUpdatesOpen(true)

    if (!window.nativeMarkdown) return
    void window.nativeMarkdown.checkForUpdates().then((nextState) => {
      setUpdateState(nextState)
      if (nextState.status === 'available' && nextState.availableVersion) {
        setStatus(`Update ${nextState.availableVersion} available`)
      }
    })
  }, [])

  const onDownloadUpdate = useCallback(async () => {
    if (!window.nativeMarkdown) return
    const nextState = await window.nativeMarkdown.downloadUpdate()
    setUpdateState(nextState)
  }, [])

  const onInstallUpdate = useCallback(() => {
    if (!window.nativeMarkdown) return
    void window.nativeMarkdown.installUpdate()
  }, [])

  const onOpenLatestRelease = useCallback(() => {
    if (!window.nativeMarkdown) return
    void window.nativeMarkdown.openLatestRelease()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return

      if (event.key.toLowerCase() === 's' && event.shiftKey) {
        event.preventDefault()
        void onSaveAs()
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void onSave()
      }

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openPalette()
      }

      if (event.key.toLowerCase() === 'o' && !event.shiftKey) {
        event.preventDefault()
        void onOpen()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpen, onSave, onSaveAs, openPalette])

  useEffect(() => {
    document.documentElement.dataset.theme = themePreference
    document.documentElement.style.colorScheme =
      themePreference === 'dark'
        ? 'dark'
        : themePreference === 'light'
          ? 'light'
          : 'light dark'
    writeThemePreference(themePreference)
    void window.nativeMarkdown?.setThemeSource(themePreference)
  }, [themePreference])

  useEffect(() => {
    if (!isPaletteOpen) return
    paletteInputRef.current?.focus()
  }, [isPaletteOpen])

  useEffect(() => {
    if (!workspace || !window.nativeMarkdown) return

    void listWorkspaceMarkdownFiles(workspace.path).then((files) => {
      setWorkspaceFiles(files)
    })
  }, [workspace])

  useEffect(() => {
    if (!window.nativeMarkdown) return

    return window.nativeMarkdown.onMenuCommand((command) => {
      if (command === 'open') {
        void onOpen()
      }

      if (command === 'openFolder') {
        void onChooseWorkspace()
      }

      if (command === 'palette') {
        openPalette()
      }

      if (command === 'save') {
        void onSave()
      }

      if (command === 'saveAs') {
        void onSaveAs()
      }

      if (command === 'updates') {
        openUpdates()
      }
    })
  }, [onChooseWorkspace, onOpen, onSave, onSaveAs, openPalette, openUpdates])

  useEffect(() => {
    if (!window.nativeMarkdown) return

    void window.nativeMarkdown.setDocumentState({
      edited: isDirty,
      filePath: file.path,
      title: `${isDirty ? '• ' : ''}${file.name}`,
    })
  }, [file.name, file.path, isDirty])

  useEffect(() => {
    if (!window.nativeMarkdown) return

    void window.nativeMarkdown.getUpdateState().then(setUpdateState)

    return window.nativeMarkdown.onUpdateState((nextState) => {
      setUpdateState(nextState)
      if (nextState.status === 'available' && nextState.availableVersion) {
        setStatus(`Update ${nextState.availableVersion} available`)
      }

      if (nextState.status === 'downloaded' && nextState.downloadedVersion) {
        setStatus(`Update ${nextState.downloadedVersion} ready`)
      }
    })
  }, [])

  return (
    <main className="app-shell" data-nav-open={isNavOpen}>
      <div className="window-drag-region" aria-hidden="true" />
      <div className="format-toolbar" aria-label="Formatting tools">
        <button type="button" aria-label="Bold" title="Bold">
          <Bold aria-hidden="true" size={28} strokeWidth={2.8} />
        </button>
        <button type="button" aria-label="Italic" title="Italic">
          <Italic aria-hidden="true" size={28} strokeWidth={2.6} />
        </button>
        <button type="button" aria-label="Underline" title="Underline">
          <Underline aria-hidden="true" size={28} strokeWidth={2.6} />
        </button>
        <span aria-hidden="true" className="format-toolbar-spacer" />
        <button type="button" aria-label="Document info" title="Document info">
          <Info aria-hidden="true" size={34} strokeWidth={2.1} />
        </button>
        <button type="button" aria-label="More options" title="More options">
          <MoreVertical aria-hidden="true" size={34} strokeWidth={2.6} />
        </button>
      </div>

      <button
        type="button"
        className="nav-toggle"
        aria-label={isNavOpen ? 'Close recent files' : 'Open recent files'}
        aria-expanded={isNavOpen}
        onClick={() => setIsNavOpen((open) => !open)}
      >
        <PanelLeft aria-hidden="true" size={20} strokeWidth={1.8} />
      </button>

      <section className="main-row">
        <aside className="left-nav" aria-label="Recent markdown files">
          <div className="left-nav-inner">
            <div className="left-nav-title">Recent</div>
            <div className="recent-list">
              {recentFiles.length === 0 ? (
                <p className="recent-empty">No markdown files opened yet.</p>
              ) : (
                recentFiles.map((recentFile) => (
                  <button
                    key={recentFile.path}
                    type="button"
                    className={
                      recentFile.path === file.path
                        ? 'recent-file active'
                        : 'recent-file'
                    }
                    onClick={() => void onOpenRecent(recentFile)}
                    title={recentFile.path}
                  >
                    <span>{recentFile.name}</span>
                    <small>{recentFile.path}</small>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="workspace">
          <HybridMarkdownEditor markdown={markdown} onChange={setMarkdown} />
        </section>
      </section>

      <footer className="statusbar">
        <span>{isDirty ? `${file.name} *` : file.name}</span>
        <span>{workspace ? workspace.name : 'No workspace'}</span>
        <span>{status}</span>
        <span>{wordCount} words</span>
        <span>{markdown.length} chars</span>
        {window.nativeMarkdown ? (
          <button
            type="button"
            className={`statusbar-update ${updateState?.status ?? 'idle'}`}
            onClick={openUpdates}
            title="Updates"
          >
            <Download aria-hidden="true" size={12} strokeWidth={1.9} />
            <span>{getUpdateButtonLabel(updateState)}</span>
          </button>
        ) : null}
        <div className="theme-switcher" aria-label="Theme mode">
          {themeOptions.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              className={themePreference === value ? 'active' : undefined}
              aria-label={label}
              aria-pressed={themePreference === value}
              title={label}
              onClick={() => setThemePreference(value)}
            >
              <Icon aria-hidden="true" size={14} strokeWidth={1.9} />
            </button>
          ))}
        </div>
        <span>{canUseNativeFileSystem() ? 'native' : canUseFilePicker() ? 'browser' : 'download fallback'}</span>
      </footer>

      <input
        ref={fallbackInputRef}
        className="hidden-file-input"
        type="file"
        accept=".md,.markdown,.mdown,text/markdown,text/plain"
        onChange={onFallbackOpen}
      />

      {isPaletteOpen ? (
        <div className="palette-backdrop" onMouseDown={closePalette}>
          <section
            className="command-palette"
            aria-label="Command palette"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="palette-search-row">
              <Search aria-hidden="true" size={18} strokeWidth={1.8} />
              <input
                ref={paletteInputRef}
                type="text"
                value={paletteQuery}
                placeholder={
                  workspace ? `Search ${workspace.name}` : 'Choose a workspace folder'
                }
                onChange={(event) => {
                  setPaletteQuery(event.target.value)
                  setHighlightedPaletteIndex(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    closePalette()
                  }

                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setHighlightedPaletteIndex((index) =>
                      Math.min(index + 1, paletteItems.length - 1),
                    )
                  }

                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setHighlightedPaletteIndex((index) => Math.max(index - 1, 0))
                  }

                  if (event.key === 'Enter') {
                    event.preventDefault()
                    runPaletteItem(highlightedPaletteIndex)
                  }
                }}
              />
            </div>

            <div className="palette-list">
              {paletteItems.map((item, index) => {
                if (item.type === 'folder') {
                  return (
                    <button
                      key="choose-folder"
                      type="button"
                      className={
                        index === highlightedPaletteIndex
                          ? 'palette-item active'
                          : 'palette-item'
                      }
                      onMouseEnter={() => setHighlightedPaletteIndex(index)}
                      onClick={() => void onChooseWorkspace()}
                    >
                      <FolderOpen aria-hidden="true" size={17} strokeWidth={1.7} />
                      <span>
                        <strong>Choose folder...</strong>
                        <small>
                          {workspace
                            ? 'Switch markdown workspace'
                            : 'Pick the repo or folder to search'}
                        </small>
                      </span>
                    </button>
                  )
                }

                return (
                  <button
                    key={item.file.path}
                    type="button"
                    className={
                      index === highlightedPaletteIndex
                        ? 'palette-item active'
                        : 'palette-item'
                    }
                    onMouseEnter={() => setHighlightedPaletteIndex(index)}
                    onClick={() => void onOpenWorkspaceFile(item.file)}
                    title={item.file.path}
                  >
                    <FileText aria-hidden="true" size={17} strokeWidth={1.7} />
                    <span>
                      <strong>{item.file.name}</strong>
                      <small>{item.file.relativePath}</small>
                    </span>
                  </button>
                )
              })}

              {paletteItems.length === 1 && workspace ? (
                <p className="palette-empty">No markdown files match that name.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {isUpdatesOpen ? (
        <div className="update-backdrop" onMouseDown={() => setIsUpdatesOpen(false)}>
          <section
            className="update-panel"
            aria-label="Downloads"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="update-panel-header">
              <div>
                <h2>Downloads</h2>
                <p>{getUpdateHeadline(updateState)}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close downloads"
                onClick={() => setIsUpdatesOpen(false)}
              >
                <X aria-hidden="true" size={18} strokeWidth={1.8} />
              </button>
            </header>

            <dl className="update-meta">
              <div>
                <dt>Installed</dt>
                <dd>{updateState?.currentVersion ?? 'development'}</dd>
              </div>
              <div>
                <dt>Latest</dt>
                <dd>{updateState?.availableVersion ?? updateState?.downloadedVersion ?? '-'}</dd>
              </div>
            </dl>

            {updateState?.status === 'downloading' ? (
              <div className="update-progress" aria-label="Download progress">
                <span style={{ width: `${updateState.progress ?? 0}%` }} />
              </div>
            ) : null}

            {updateState?.error ? (
              <p className="update-error">{updateState.error}</p>
            ) : null}

            <div className="update-actions">
              <button
                type="button"
                onClick={openUpdates}
                disabled={updateState?.status === 'checking' || updateState?.status === 'downloading'}
              >
                <RefreshCw aria-hidden="true" size={16} strokeWidth={1.8} />
                <span>Check</span>
              </button>
              <button
                type="button"
                onClick={() => void onDownloadUpdate()}
                disabled={updateState?.status !== 'available'}
              >
                <Download aria-hidden="true" size={16} strokeWidth={1.8} />
                <span>Download</span>
              </button>
              <button
                type="button"
                onClick={onInstallUpdate}
                disabled={updateState?.status !== 'downloaded'}
              >
                <RotateCw aria-hidden="true" size={16} strokeWidth={1.8} />
                <span>Install</span>
              </button>
              <button type="button" onClick={onOpenLatestRelease}>
                <ExternalLink aria-hidden="true" size={16} strokeWidth={1.8} />
                <span>Releases</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

function getUpdateButtonLabel(state: NativeUpdateState | null) {
  if (!state) return 'Updates'
  if (state.status === 'checking') return 'Checking'
  if (state.status === 'available') return `v${state.availableVersion}`
  if (state.status === 'downloading') return `${state.progress ?? 0}%`
  if (state.status === 'downloaded') return 'Ready'
  if (state.status === 'error') return 'Update error'
  return 'Updates'
}

function getUpdateHeadline(state: NativeUpdateState | null) {
  if (!state) return 'Checking release feed'
  if (!state.isPackaged) return 'Available in packaged builds'
  if (state.status === 'checking') return 'Checking GitHub releases'
  if (state.status === 'available' && state.availableVersion) {
    return `Version ${state.availableVersion} is available`
  }
  if (state.status === 'downloading') return `Downloading ${state.progress ?? 0}%`
  if (state.status === 'downloaded' && state.downloadedVersion) {
    return `Version ${state.downloadedVersion} is ready to install`
  }
  if (state.status === 'not-available') return 'Slate is up to date'
  if (state.status === 'error') return 'Update check failed'
  return 'No update check has run'
}

function readRecentFiles(): RecentMarkdownFile[] {
  try {
    const stored =
      localStorage.getItem(recentFilesKey) ??
      localStorage.getItem(legacyRecentFilesKey)
    if (!stored) return []

    const parsed = JSON.parse(stored) as RecentMarkdownFile[]
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter(
        (item) =>
          typeof item.name === 'string' &&
          typeof item.path === 'string' &&
          typeof item.touchedAt === 'number',
      )
      .slice(0, 12)
  } catch {
    return []
  }
}

function writeRecentFiles(files: RecentMarkdownFile[]) {
  localStorage.setItem(recentFilesKey, JSON.stringify(files))
}

function readWorkspace(): WorkspaceFolder | null {
  try {
    const stored =
      localStorage.getItem(workspaceKey) ?? localStorage.getItem(legacyWorkspaceKey)
    if (!stored) return null

    const parsed = JSON.parse(stored) as WorkspaceFolder
    if (typeof parsed.name !== 'string' || typeof parsed.path !== 'string') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function readInitialWorkspace(): WorkspaceFolder | null {
  return readLaunchWorkspace() ?? readWorkspace()
}

function readLaunchWorkspace(): WorkspaceFolder | null {
  try {
    const workspacePath = new URLSearchParams(window.location.search).get(
      'workspacePath',
    )
    if (!workspacePath) return null

    return {
      name: getPathName(workspacePath),
      path: workspacePath,
    }
  } catch {
    return null
  }
}

function writeWorkspace(workspace: WorkspaceFolder) {
  localStorage.setItem(workspaceKey, JSON.stringify(workspace))
}

function readThemePreference(): ThemePreference {
  const stored = localStorage.getItem(themeKey)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }

  return 'system'
}

function writeThemePreference(theme: ThemePreference) {
  localStorage.setItem(themeKey, theme)
}

function getPathName(filePath: string) {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath
}

export default App
