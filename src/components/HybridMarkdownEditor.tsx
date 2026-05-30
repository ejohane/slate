import {
  memo,
  useCallback,
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

  return (
    <div className="hybrid-editor" aria-label="Markdown document">
      {blocks.map((block, index) => {
        if (index === safeActiveBlock?.index) {
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
    <article
      className={`markdown-body markdown-rendered-block ${kind}`}
      onClick={onActivate}
      onFocus={onActivate}
      tabIndex={0}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  )
})
