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
    highlight: highlightFence,
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

function highlightFence(code: string, language: string) {
  if (!['ts', 'typescript'].includes(language.toLowerCase())) return ''

  return highlightTypeScript(code)
}

function highlightTypeScript(code: string) {
  return escapeHtml(code).replace(
    /\b(type|string|void|Plugin)\b|=&gt;|[?=:]/g,
    (token) => {
      if (token === 'Plugin') {
        return `<span class="syntax-type">${token}</span>`
      }

      if (['type', 'string', 'void'].includes(token)) {
        return `<span class="syntax-keyword">${token}</span>`
      }

      return `<span class="syntax-operator">${token}</span>`
    },
  )
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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
