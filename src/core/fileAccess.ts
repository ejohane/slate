type FilePickerHandle = {
  name: string
  getFile: () => Promise<File>
  createWritable: () => Promise<FileSystemWritableFileStream>
}

type FilePickerWindow = Window &
  typeof globalThis & {
    showOpenFilePicker?: (options?: unknown) => Promise<FilePickerHandle[]>
    showSaveFilePicker?: (options?: unknown) => Promise<FilePickerHandle>
  }

export type MarkdownFile = {
  name: string
  handle: FilePickerHandle | null
  path: string | null
  workspacePath?: string | null
  downloaded?: boolean
}

export type WorkspaceFile = {
  name: string
  path: string
  relativePath: string
}

export type WorkspaceFolder = {
  name: string
  path: string
}

export function canUseNativeFileSystem() {
  return Boolean(window.nativeMarkdown)
}

export function canUseFilePicker() {
  if (canUseNativeFileSystem()) return true

  const pickerWindow = window as FilePickerWindow
  return Boolean(pickerWindow.showOpenFilePicker && pickerWindow.showSaveFilePicker)
}

export async function openMarkdownFile() {
  if (window.nativeMarkdown) {
    const opened = await window.nativeMarkdown.openFile()
    if (!opened) return null

    return {
      name: opened.name,
      handle: null,
      path: opened.path,
      workspacePath: opened.workspacePath,
      text: opened.text,
    }
  }

  const pickerWindow = window as FilePickerWindow
  const [handle] = await pickerWindow.showOpenFilePicker?.({
    multiple: false,
    types: [
      {
        description: 'Markdown',
        accept: {
          'text/markdown': ['.md', '.markdown', '.mdown'],
          'text/plain': ['.txt'],
        },
      },
    ],
  }) ?? []

  if (!handle) return null

  const file = await handle.getFile()
  return {
    name: file.name,
    handle,
    path: null,
    workspacePath: null,
    text: await file.text(),
  }
}

export async function openMarkdownFilePath(filePath: string) {
  if (!window.nativeMarkdown) return null

  const opened = await window.nativeMarkdown.openPath(filePath)
  if (!opened) return null

  return {
    name: opened.name,
    handle: null,
    path: opened.path,
    workspacePath: opened.workspacePath,
    text: opened.text,
  }
}

export async function chooseWorkspaceFolder() {
  if (!window.nativeMarkdown) return null

  const workspace = await window.nativeMarkdown.chooseWorkspaceFolder()
  if (!workspace) return null

  return {
    folder: { name: workspace.name, path: workspace.path },
    files: workspace.files,
  }
}

export async function listWorkspaceMarkdownFiles(folderPath: string) {
  if (!window.nativeMarkdown) return []
  return window.nativeMarkdown.listWorkspaceMarkdownFiles(folderPath)
}

export async function saveMarkdownFile(markdown: string, file: MarkdownFile) {
  if (window.nativeMarkdown) {
    const saved = await window.nativeMarkdown.saveFile({
      filePath: file.path,
      suggestedName: file.name,
      text: markdown,
    })

    if (!saved) return null

    return { name: saved.name, path: saved.path, handle: null }
  }

  if (file.handle) {
    await writeFile(file.handle, markdown)
    return { name: file.name, path: null, handle: file.handle }
  }

  return saveMarkdownFileAs(markdown, file.name)
}

export async function saveMarkdownFileAs(markdown: string, suggestedName: string) {
  if (window.nativeMarkdown) {
    const saved = await window.nativeMarkdown.saveFile({
      filePath: null,
      suggestedName,
      text: markdown,
    })

    if (!saved) return null

    return { name: saved.name, path: saved.path, handle: null }
  }

  const pickerWindow = window as FilePickerWindow

  if (pickerWindow.showSaveFilePicker) {
    const handle = await pickerWindow.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: 'Markdown',
          accept: { 'text/markdown': ['.md', '.markdown'] },
        },
      ],
    })

    await writeFile(handle, markdown)
    return { name: handle.name, path: null, handle }
  }

  downloadMarkdown(markdown, suggestedName)
  return { name: suggestedName, path: null, handle: null, downloaded: true }
}

async function writeFile(handle: FilePickerHandle, markdown: string) {
  const writable = await handle.createWritable()
  await writable.write(markdown)
  await writable.close()
}

function downloadMarkdown(markdown: string, fileName: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName || 'untitled.md'
  link.click()
  URL.revokeObjectURL(url)
}
