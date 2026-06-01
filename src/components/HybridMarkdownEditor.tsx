import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { markdownPlugins } from '../core/editorPlugins'
import {
  mergeBlockWithPrevious,
  replaceBlockAt,
  removeBlockAt,
  splitBlockAt,
  splitMarkdownBlocks,
  type MarkdownBlockKind,
} from '../core/markdownBlocks'
import { renderMarkdown } from '../core/renderMarkdown'

type HybridMarkdownEditorProps = {
  markdown: string
  onChange: (markdown: string) => void
}

type CaretPlacement = 'start' | 'end' | number
type ActiveBlock = {
  index: number
  placement: CaretPlacement
}

export function HybridMarkdownEditor({
  markdown,
  onChange,
}: HybridMarkdownEditorProps) {
  const [activeBlock, setActiveBlock] = useState<ActiveBlock | null>(null)
  const [isDocumentSourceActive, setIsDocumentSourceActive] = useState(false)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const documentSourceRef = useRef<HTMLTextAreaElement | null>(null)
  const skipNextBlurRef = useRef(false)
  const blocks = useMemo(() => splitMarkdownBlocks(markdown), [markdown])
  const safeActiveBlock =
    activeBlock !== null &&
    activeBlock.index >= 0 &&
    activeBlock.index < blocks.length
      ? activeBlock
      : null

  const updateBlock = useCallback(
    (index: number, raw: string) => {
      onChange(replaceBlockAt(markdown, index, raw))
    },
    [markdown, onChange],
  )

  const splitBlock = useCallback(
    (index: number, offset: number) => {
      const result = splitBlockAt(markdown, index, offset)
      skipNextBlurRef.current = true
      onChange(result.markdown)
      setActiveBlock({ index: result.nextBlockIndex, placement: 'start' })
    },
    [markdown, onChange],
  )

  const removeBlock = useCallback(
    (index: number) => {
      const result = removeBlockAt(markdown, index)
      skipNextBlurRef.current = true
      onChange(result.markdown)
      setActiveBlock({ index: result.nextBlockIndex, placement: 'end' })
    },
    [markdown, onChange],
  )

  const mergeWithPreviousBlock = useCallback(
    (index: number) => {
      const result = mergeBlockWithPrevious(markdown, index)
      if (!result.changed) return false

      skipNextBlurRef.current = true
      onChange(result.markdown)
      setActiveBlock({
        index: result.nextBlockIndex,
        placement: result.caretOffset,
      })
      return true
    },
    [markdown, onChange],
  )

  const activateBlock = useCallback(
    (index: number, placement: CaretPlacement = 'end') => {
      skipNextBlurRef.current = true
      setActiveBlock({ index, placement })
    },
    [],
  )

  const deactivateBlock = useCallback(() => {
    setActiveBlock(null)
  }, [])

  const selectDocumentSource = useCallback(() => {
    skipNextBlurRef.current = true
    setActiveBlock(null)
    setIsDocumentSourceActive(true)
  }, [])

  const navigateRelative = useCallback(
    (fromIndex: number, direction: -1 | 1, placement: CaretPlacement) => {
      let nextIndex = fromIndex + direction

      while (
        nextIndex >= 0 &&
        nextIndex < blocks.length &&
        blocks[nextIndex].kind === 'blank'
      ) {
        nextIndex += direction
      }

      if (nextIndex < 0 || nextIndex >= blocks.length) return

      skipNextBlurRef.current = true
      setActiveBlock({ index: nextIndex, placement })
    },
    [blocks],
  )

  const handleBlur = useCallback(() => {
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false
      return
    }

    requestAnimationFrame(() => {
      if (
        document.activeElement instanceof HTMLTextAreaElement &&
        document.activeElement.classList.contains('markdown-source-block')
      ) {
        return
      }

      setActiveBlock(null)
    })
  }, [])

  useLayoutEffect(() => {
    if (!isDocumentSourceActive) return

    const textarea = documentSourceRef.current
    if (!textarea) return

    const selectAll = () => {
      textarea.focus({ preventScroll: true })
      textarea.setSelectionRange(0, textarea.value.length)
    }

    selectAll()
    const frameId = requestAnimationFrame(selectAll)
    return () => cancelAnimationFrame(frameId)
  }, [isDocumentSourceActive])

  useEffect(() => {
    if (isDocumentSourceActive) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        event.key.toLowerCase() !== 'a'
      ) {
        return
      }

      const editor = editorRef.current
      if (!editor) return

      const activeElement = document.activeElement
      const eventTarget = event.target
      const isEditorTarget =
        eventTarget instanceof Node && editor.contains(eventTarget)
      const isEditorFocus =
        activeElement === document.body ||
        activeElement === document.documentElement ||
        activeElement === editor ||
        (activeElement instanceof Node && editor.contains(activeElement))

      if (!isEditorTarget && !isEditorFocus) return

      event.preventDefault()
      selectDocumentSource()
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [isDocumentSourceActive, selectDocumentSource])

  if (isDocumentSourceActive) {
    return (
      <textarea
        ref={documentSourceRef}
        className="source-editor"
        value={markdown}
        spellCheck="true"
        onBlur={() => setIsDocumentSourceActive(false)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            setIsDocumentSourceActive(false)
          }
        }}
        aria-label="Edit Markdown document"
      />
    )
  }

  return (
    <div
      ref={editorRef}
      className="hybrid-editor"
      aria-label="Markdown document"
    >
      {blocks.map((block, index) => {
        if (index === safeActiveBlock?.index) {
          if (block.kind === 'list') {
            return (
              <MarkdownListSourceBlock
                key={`${index}-list-source`}
                placement={safeActiveBlock.placement}
                raw={block.raw}
                onBlur={handleBlur}
                onChange={(raw) => updateBlock(index, raw)}
                onDeactivate={deactivateBlock}
                onNavigateNext={(placement) =>
                  navigateRelative(index, 1, placement)
                }
                onNavigatePrevious={(placement) =>
                  navigateRelative(index, -1, placement)
                }
                onMergeWithPrevious={() => mergeWithPreviousBlock(index)}
                onRemove={() => removeBlock(index)}
              />
            )
          }

          return (
            <MarkdownSourceBlock
              key={`${index}-source`}
              kind={block.kind}
              placement={safeActiveBlock.placement}
              raw={block.raw}
              onBlur={handleBlur}
              onChange={(raw) => updateBlock(index, raw)}
              onDeactivate={deactivateBlock}
              onNavigateNext={(placement) =>
                navigateRelative(index, 1, placement)
              }
              onNavigatePrevious={(placement) =>
                navigateRelative(index, -1, placement)
              }
              onMergeWithPrevious={() => mergeWithPreviousBlock(index)}
              onRemove={() => removeBlock(index)}
              onSplitAt={(offset) => splitBlock(index, offset)}
            />
          )
        }

        if (block.kind === 'blank') {
          const isCollapsedSeparator = shouldCollapseBlankSeparator(
            blocks,
            index,
            safeActiveBlock?.index,
          )

          return (
            <button
              key={`${index}-blank`}
              type="button"
              className={`markdown-blank-line${
                isCollapsedSeparator ? ' collapsed' : ''
              }`}
              tabIndex={isCollapsedSeparator ? -1 : undefined}
              aria-hidden={isCollapsedSeparator}
              onClick={() => activateBlock(index)}
              aria-label="Blank line"
            />
          )
        }

        return (
          <MarkdownRenderedBlock
            key={`${index}-${block.kind}`}
            kind={block.kind}
            raw={block.raw}
            onActivate={() => activateBlock(index)}
          />
        )
      })}
    </div>
  )
}

type MarkdownListSourceBlockProps = {
  placement: CaretPlacement
  raw: string
  onBlur: () => void
  onChange: (raw: string) => void
  onDeactivate: () => void
  onMergeWithPrevious: () => boolean
  onNavigateNext: (placement: CaretPlacement) => void
  onNavigatePrevious: (placement: CaretPlacement) => void
  onRemove: () => void
}

function MarkdownListSourceBlock({
  placement,
  raw,
  onBlur,
  onChange,
  onDeactivate,
  onMergeWithPrevious,
  onNavigateNext,
  onNavigatePrevious,
  onRemove,
}: MarkdownListSourceBlockProps) {
  const listRef = useRef<HTMLUListElement | null>(null)
  const lastRenderedRawRef = useRef('')
  const items = useMemo(() => parseListItems(raw), [raw])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    if (lastRenderedRawRef.current === raw) return

    list.replaceChildren(
      ...items.map((item) => {
        const listItem = document.createElement('li')
        listItem.textContent = item
        return listItem
      }),
    )
    lastRenderedRawRef.current = raw
  }, [items, raw])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return

    list.focus({ preventScroll: true })
    placeListCaret(list, placement)
    list.scrollIntoView({ block: 'nearest' })
  }, [placement])

  return (
    <div className="markdown-block-shell list editing">
      <ul
        ref={listRef}
        className="markdown-list-editor"
        contentEditable
        suppressContentEditableWarning
        spellCheck="true"
        onBlur={onBlur}
        onInput={(event) => {
          const nextItems = readListEditorItems(event.currentTarget)
          const nextRaw = nextItems.map((item) => `- ${item}`).join('\n')
          lastRenderedRawRef.current = nextRaw
          onChange(nextRaw)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onDeactivate()
            return
          }

          if (event.key === 'Backspace' && isListEditorEmpty(event.currentTarget)) {
            event.preventDefault()
            onRemove()
            return
          }

          if (event.key === 'Backspace' && isListCaretAtStart(event.currentTarget)) {
            if (onMergeWithPrevious()) {
              event.preventDefault()
            }
            return
          }

          if (event.key === 'ArrowUp' && isListCaretInFirstItem(event.currentTarget)) {
            event.preventDefault()
            onNavigatePrevious('end')
            return
          }

          if (event.key === 'ArrowDown' && isListCaretInLastItem(event.currentTarget)) {
            event.preventDefault()
            onNavigateNext('start')
          }
        }}
        aria-label="Edit Markdown list"
      />
    </div>
  )
}

type MarkdownSourceBlockProps = {
  kind: MarkdownBlockKind
  placement: CaretPlacement
  raw: string
  onBlur: () => void
  onChange: (raw: string) => void
  onDeactivate: () => void
  onMergeWithPrevious: () => boolean
  onNavigateNext: (placement: CaretPlacement) => void
  onNavigatePrevious: (placement: CaretPlacement) => void
  onRemove: () => void
  onSplitAt: (offset: number) => void
}

function parseListItems(raw: string) {
  const items = raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))

  return items.length > 0 ? items : ['']
}

function readListEditorItems(list: HTMLUListElement) {
  const items = Array.from(list.querySelectorAll('li')).map((item) =>
    (item.textContent ?? '').replace(/\u00a0/g, ' ').trimEnd(),
  )

  if (items.length > 0) return items

  return [(list.textContent ?? '').replace(/\u00a0/g, ' ').trimEnd()]
}

function placeListCaret(list: HTMLUListElement, placement: CaretPlacement) {
  const selection = window.getSelection()
  if (!selection) return

  const items = Array.from(list.querySelectorAll('li'))
  const item =
    placement === 'start' || typeof placement === 'number'
      ? items[0]
      : items[items.length - 1]
  if (!item) return

  const textNode = getEditableTextNode(item)
  const offset =
    typeof placement === 'number'
      ? Math.min(Math.max(placement, 0), textNode.textContent?.length ?? 0)
      : placement === 'start'
        ? 0
        : (textNode.textContent ?? '').length

  const range = document.createRange()
  range.setStart(textNode, offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function getEditableTextNode(element: HTMLElement) {
  if (element.firstChild instanceof Text) return element.firstChild

  const textNode = document.createTextNode('')
  element.append(textNode)
  return textNode
}

function isListEditorEmpty(list: HTMLUListElement) {
  return readListEditorItems(list).every((item) => item.length === 0)
}

function isListCaretAtStart(list: HTMLUListElement) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
    return false
  }

  const range = selection.getRangeAt(0)
  const firstItem = list.querySelector('li')
  if (!firstItem || !firstItem.contains(range.startContainer)) return false

  return getRangeOffsetInElement(firstItem, range) === 0
}

function isListCaretInFirstItem(list: HTMLUListElement) {
  return isListCaretInBoundaryItem(list, 'first')
}

function isListCaretInLastItem(list: HTMLUListElement) {
  return isListCaretInBoundaryItem(list, 'last')
}

function isListCaretInBoundaryItem(
  list: HTMLUListElement,
  boundary: 'first' | 'last',
) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false

  const items = Array.from(list.querySelectorAll('li'))
  const item = boundary === 'first' ? items[0] : items[items.length - 1]
  if (!item) return false

  return item.contains(selection.getRangeAt(0).startContainer)
}

function getRangeOffsetInElement(element: Element, range: Range) {
  const prefixRange = document.createRange()
  prefixRange.selectNodeContents(element)
  prefixRange.setEnd(range.startContainer, range.startOffset)
  return prefixRange.toString().length
}

function MarkdownSourceBlock({
  kind,
  placement,
  raw,
  onBlur,
  onChange,
  onDeactivate,
  onMergeWithPrevious,
  onNavigateNext,
  onNavigatePrevious,
  onRemove,
  onSplitAt,
}: MarkdownSourceBlockProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = '0px'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [raw])

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.focus({ preventScroll: true })
    const position =
      typeof placement === 'number'
        ? Math.min(Math.max(placement, 0), textarea.value.length)
        : placement === 'start'
          ? 0
          : textarea.value.length
    textarea.setSelectionRange(position, position)
    textarea.scrollIntoView({ block: 'nearest' })
  }, [placement])

  return (
    <textarea
      ref={textareaRef}
      className={`markdown-source-block ${kind}`}
      value={raw}
      rows={1}
      spellCheck="true"
      onBlur={onBlur}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onDeactivate()
          return
        }

        if (
          event.key === 'Backspace' &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.currentTarget.value.length === 0 &&
          event.currentTarget.selectionStart === 0 &&
          event.currentTarget.selectionEnd === 0
        ) {
          event.preventDefault()
          onRemove()
          return
        }

        if (
          event.key === 'Backspace' &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          event.currentTarget.selectionStart === 0 &&
          event.currentTarget.selectionEnd === 0
        ) {
          if (onMergeWithPrevious()) {
            event.preventDefault()
          }
          return
        }

        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          kind !== 'code' &&
          event.currentTarget.selectionStart ===
            event.currentTarget.selectionEnd &&
          isSelectionOnLastLine(event.currentTarget)
        ) {
          event.preventDefault()
          onSplitAt(event.currentTarget.selectionStart)
          return
        }

        if (
          event.key === 'ArrowUp' &&
          isSelectionOnFirstLine(event.currentTarget)
        ) {
          event.preventDefault()
          onNavigatePrevious('end')
          return
        }

        if (
          event.key === 'ArrowDown' &&
          isSelectionOnLastLine(event.currentTarget)
        ) {
          event.preventDefault()
          onNavigateNext('start')
          return
        }

        if (
          event.key === 'ArrowLeft' &&
          event.currentTarget.selectionStart === 0 &&
          event.currentTarget.selectionEnd === 0
        ) {
          event.preventDefault()
          onNavigatePrevious('end')
          return
        }

        if (
          event.key === 'ArrowRight' &&
          event.currentTarget.selectionStart ===
            event.currentTarget.value.length &&
          event.currentTarget.selectionEnd === event.currentTarget.value.length
        ) {
          event.preventDefault()
          onNavigateNext('start')
        }
      }}
      aria-label="Edit Markdown block"
    />
  )
}

function isSelectionOnFirstLine(textarea: HTMLTextAreaElement) {
  const beforeSelection = textarea.value.slice(0, textarea.selectionStart)
  return !beforeSelection.includes('\n')
}

function isSelectionOnLastLine(textarea: HTMLTextAreaElement) {
  const afterSelection = textarea.value.slice(textarea.selectionEnd)
  return !afterSelection.includes('\n')
}

function shouldCollapseBlankSeparator(
  blocks: ReturnType<typeof splitMarkdownBlocks>,
  index: number,
  activeIndex?: number,
) {
  if (index > 0 && blocks[index - 1].kind === 'blank') return false

  const previousBlock = blocks[index - 1]
  if (!previousBlock || previousBlock.kind === 'blank') return false

  let nextIndex = index + 1
  while (nextIndex < blocks.length && blocks[nextIndex].kind === 'blank') {
    if (nextIndex === activeIndex) return true
    nextIndex += 1
  }

  return nextIndex < blocks.length
}

const MarkdownRenderedBlock = memo(function MarkdownRenderedBlock({
  kind,
  raw,
  onActivate,
}: {
  kind: MarkdownBlockKind
  raw: string
  onActivate: () => void
}) {
  const rendered = useMemo(() => renderMarkdown(raw, markdownPlugins), [raw])

  return (
    <div className={`markdown-block-shell ${kind}`}>
      <article
        className={`markdown-body markdown-rendered-block ${kind}`}
        onClick={onActivate}
        onFocus={onActivate}
        tabIndex={0}
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
    </div>
  )
})
