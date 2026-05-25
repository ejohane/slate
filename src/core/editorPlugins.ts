import type MarkdownIt from 'markdown-it'

export type EditorCommand = {
  id: string
  title: string
  run: (markdown: string) => string
}

export type EditorPlugin = {
  name: string
  configureMarkdown?: (markdown: MarkdownIt) => void
  commands?: EditorCommand[]
}

export const markdownPlugins: EditorPlugin[] = [
  {
    name: 'core-markdown',
    configureMarkdown(markdown) {
      markdown.enable(['table', 'strikethrough'])
    },
  },
]
