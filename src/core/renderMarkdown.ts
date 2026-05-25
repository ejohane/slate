import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import type { EditorPlugin } from './editorPlugins'

const rendererCache = new Map<string, MarkdownIt>()
const htmlCache = new Map<string, string>()
const maxCachedDocuments = 600

export function renderMarkdown(markdown: string, plugins: EditorPlugin[]) {
  const pluginKey = plugins.map((plugin) => plugin.name).join('|')
  const cacheKey = `${pluginKey}\n${markdown}`
  const cached = htmlCache.get(cacheKey)
  if (cached !== undefined) return cached

  const renderer = getRenderer(pluginKey, plugins)
  const html = DOMPurify.sanitize(renderer.render(markdown))
  htmlCache.set(cacheKey, html)
  pruneCache()
  return html
}

function getRenderer(pluginKey: string, plugins: EditorPlugin[]) {
  const cached = rendererCache.get(pluginKey)
  if (cached) return cached

  const renderer = new MarkdownIt({
    breaks: true,
    html: false,
    linkify: true,
    typographer: true,
  })

  for (const plugin of plugins) {
    plugin.configureMarkdown?.(renderer)
  }

  rendererCache.set(pluginKey, renderer)
  return renderer
}

function pruneCache() {
  if (htmlCache.size <= maxCachedDocuments) return

  const deleteCount = htmlCache.size - maxCachedDocuments
  let deleted = 0

  for (const key of htmlCache.keys()) {
    htmlCache.delete(key)
    deleted += 1
    if (deleted >= deleteCount) break
  }
}
