export type MarkdownBlockKind =
  | 'blank'
  | 'blockquote'
  | 'code'
  | 'heading'
  | 'list'
  | 'paragraph'
  | 'table'

export type MarkdownBlock = {
  raw: string
  kind: MarkdownBlockKind
}

const codeFencePattern = /^ {0,3}(```+|~~~+)/
const headingPattern = /^ {0,3}#{1,6}\s/
const listPattern = /^ {0,3}([-+*]|\d+[.)])\s+/
const blockquotePattern = /^ {0,3}>\s?/
const tableDividerPattern = /^\s*\|?[\s:-]+\|[\s|:-]*$/

export function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (trimmed === '') {
      blocks.push({ raw: line, kind: 'blank' })
      index += 1
      continue
    }

    const fence = line.match(codeFencePattern)?.[1]
    if (fence) {
      const collected = [line]
      index += 1

      while (index < lines.length) {
        collected.push(lines[index])
        if (lines[index].trimStart().startsWith(fence)) {
          index += 1
          break
        }
        index += 1
      }

      blocks.push({ raw: collected.join('\n'), kind: 'code' })
      continue
    }

    if (headingPattern.test(line)) {
      blocks.push({ raw: line, kind: 'heading' })
      index += 1
      continue
    }

    if (isTableStart(lines, index)) {
      const collected = [line, lines[index + 1]]
      index += 2

      while (index < lines.length && lines[index].includes('|')) {
        collected.push(lines[index])
        index += 1
      }

      blocks.push({ raw: collected.join('\n'), kind: 'table' })
      continue
    }

    if (listPattern.test(line)) {
      const collected = [line]
      index += 1

      while (
        index < lines.length &&
        (listPattern.test(lines[index]) ||
          /^\s{2,}\S/.test(lines[index]))
      ) {
        collected.push(lines[index])
        index += 1
      }

      blocks.push({ raw: collected.join('\n'), kind: 'list' })
      continue
    }

    if (blockquotePattern.test(line)) {
      const collected = [line]
      index += 1

      while (index < lines.length && blockquotePattern.test(lines[index])) {
        collected.push(lines[index])
        index += 1
      }

      blocks.push({ raw: collected.join('\n'), kind: 'blockquote' })
      continue
    }

    const collected = [line]
    index += 1

    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !headingPattern.test(lines[index]) &&
      !codeFencePattern.test(lines[index]) &&
      !listPattern.test(lines[index]) &&
      !blockquotePattern.test(lines[index]) &&
      !isTableStart(lines, index)
    ) {
      collected.push(lines[index])
      index += 1
    }

    blocks.push({ raw: collected.join('\n'), kind: 'paragraph' })
  }

  return blocks.length > 0 ? blocks : [{ raw: '', kind: 'blank' }]
}

export function replaceBlockAt(
  markdown: string,
  blockIndex: number,
  nextRaw: string,
) {
  const blocks = splitMarkdownBlocks(markdown)
  if (blockIndex < 0 || blockIndex >= blocks.length) return markdown

  blocks[blockIndex] = {
    raw: nextRaw.replace(/\r\n?/g, '\n'),
    kind: inferBlockKind(nextRaw),
  }

  return blocks.map((block) => block.raw).join('\n')
}

export function splitBlockAt(
  markdown: string,
  blockIndex: number,
  offset: number,
) {
  const blocks = splitMarkdownBlocks(markdown)
  if (blockIndex < 0 || blockIndex >= blocks.length) {
    return { markdown, nextBlockIndex: blockIndex }
  }

  const raw = blocks[blockIndex].raw.replace(/\r\n?/g, '\n')
  const splitOffset = Math.min(Math.max(offset, 0), raw.length)
  const before = raw.slice(0, splitOffset).replace(/\n+$/g, '')
  const after = raw.slice(splitOffset).replace(/^\n+/g, '')
  const replacement: MarkdownBlock[] = []
  let nextBlockIndex = blockIndex + 1

  if (blocks[blockIndex].kind === 'blank') {
    blocks.splice(
      blockIndex,
      1,
      { raw: '', kind: 'blank' },
      { raw: '', kind: 'blank' },
    )

    return {
      markdown: blocks.map((block) => block.raw).join('\n'),
      nextBlockIndex,
    }
  }

  replacement.push({
    raw: before,
    kind: inferBlockKind(before),
  })

  if (after.trim() === '') {
    replacement.push({ raw: '', kind: 'blank' })
    replacement.push({ raw: '', kind: 'blank' })
    nextBlockIndex = blockIndex + 2
  } else {
    replacement.push({ raw: '', kind: 'blank' })
    replacement.push({
      raw: after,
      kind: inferBlockKind(after),
    })
    nextBlockIndex = blockIndex + 2
  }

  blocks.splice(blockIndex, 1, ...replacement)

  return {
    markdown: blocks.map((block) => block.raw).join('\n'),
    nextBlockIndex,
  }
}

export function countWords(markdown: string) {
  return (
    markdown
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[#>*_`~\-[\]()|]/g, ' ')
      .match(/\b[\w']+\b/g)?.length ?? 0
  )
}

function inferBlockKind(raw: string): MarkdownBlockKind {
  const firstLine = raw.split('\n')[0] ?? ''
  if (raw.trim() === '') return 'blank'
  if (codeFencePattern.test(firstLine)) return 'code'
  if (headingPattern.test(firstLine)) return 'heading'
  if (listPattern.test(firstLine)) return 'list'
  if (blockquotePattern.test(firstLine)) return 'blockquote'
  return 'paragraph'
}

function isTableStart(lines: string[], index: number) {
  return (
    index + 1 < lines.length &&
    lines[index].includes('|') &&
    tableDividerPattern.test(lines[index + 1])
  )
}
