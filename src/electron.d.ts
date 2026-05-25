export type NativeMenuCommand =
  | 'open'
  | 'openFolder'
  | 'palette'
  | 'save'
  | 'saveAs'

export type NativeWorkspaceFile = {
  name: string
  path: string
  relativePath: string
}

export type NativeWorkspace = {
  name: string
  path: string
  files: NativeWorkspaceFile[]
}

export type NativeOpenFileResult = {
  name: string
  path: string
  text: string
  workspacePath: string
} | null

export type NativeSaveFilePayload = {
  filePath: string | null
  suggestedName: string
  text: string
}

export type NativeSaveFileResult = {
  name: string
  path: string
} | null

declare global {
  interface Window {
    nativeMarkdown?: {
      openFile: () => Promise<NativeOpenFileResult>
      openPath: (filePath: string) => Promise<NativeOpenFileResult>
      saveFile: (
        payload: NativeSaveFilePayload,
      ) => Promise<NativeSaveFileResult>
      chooseWorkspaceFolder: () => Promise<NativeWorkspace | null>
      listWorkspaceMarkdownFiles: (
        folderPath: string,
      ) => Promise<NativeWorkspaceFile[]>
      setDocumentState: (payload: {
        edited: boolean
        filePath: string | null
        title: string
      }) => Promise<void>
      onMenuCommand: (
        callback: (command: NativeMenuCommand) => void,
      ) => () => void
    }
  }
}

export {}
