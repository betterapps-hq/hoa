import type { Element, Properties, Root, Text } from "hast"
import { SKIP, visit } from "unist-util-visit"

export type SourceRange = { start: number; end: number }

/** A passage to highlight: its exact range in the page's source text when known, else its quote, found on the page. */
export type PageHighlight = { documentId: string; pageIndex: number; quote: string; range?: SourceRange }

/** The highlights' ranges in the page's source text, merged where they overlap. Quotes not on the page are skipped. */
export function highlightRanges(text: string, highlights: readonly Pick<PageHighlight, "quote" | "range">[]) {
  const ranges = highlights
    .flatMap((highlight): SourceRange[] => {
      if (highlight.range) {
        return [highlight.range]
      }
      const start = highlight.quote ? text.indexOf(highlight.quote) : -1
      return start >= 0 ? [{ start, end: start + highlight.quote.length }] : []
    })
    .toSorted((a, b) => a.start - b.start)
  const merged: SourceRange[] = []
  for (const range of ranges) {
    const last = merged.at(-1)
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

type Piece = { start: number; text: string; isHighlight: boolean }

/** Splits a run of text that starts at `start` in the source into plain and highlighted pieces. */
export function splitByRanges(text: string, start: number, ranges: readonly SourceRange[]): Piece[] {
  const pieces: Piece[] = []
  let cursor = 0
  for (const range of ranges) {
    const from = Math.max(range.start - start, cursor)
    const to = Math.min(range.end - start, text.length)
    if (to <= from) {
      continue
    }
    if (from > cursor) {
      pieces.push({ start: start + cursor, text: text.slice(cursor, from), isHighlight: false })
    }
    pieces.push({ start: start + from, text: text.slice(from, to), isHighlight: true })
    cursor = to
  }
  if (cursor < text.length) {
    pieces.push({ start: start + cursor, text: text.slice(cursor), isHighlight: false })
  }
  return pieces
}

const highlightClass = ["rounded-sm", "bg-amber-200", "dark:bg-amber-700"]

function pieceProperties(piece: Piece, isExact: boolean): Properties {
  const properties: Properties = { dataSource: piece.start }
  if (!isExact) {
    properties.dataInexact = ""
  }
  if (piece.isHighlight) {
    properties.className = highlightClass
  }
  return properties
}

/**
 * A rehype plugin for rendered Markdown: wraps every text node in a span that records where its text starts in the
 * page's source, so a selection maps back to an exact source range, and marks the highlighted ranges. A text node whose
 * rendered length differs from its source span (an escape or entity) keeps its start only.
 */
export function rehypeSourceOffsets(ranges: readonly SourceRange[]) {
  return () => (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent) => {
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      if (!parent || index === undefined || start === undefined || end === undefined || !node.value.trim()) {
        return
      }
      const isExact = end - start === node.value.length
      const pieces = isExact
        ? splitByRanges(node.value, start, ranges)
        : [
            {
              start,
              text: node.value,
              isHighlight: ranges.some((range) => range.start < end && range.end > start)
            }
          ]
      parent.children.splice(
        index,
        1,
        ...pieces.map((piece): Element => ({
          type: "element",
          tagName: piece.isHighlight ? "mark" : "span",
          properties: pieceProperties(piece, isExact),
          children: [{ type: "text", value: piece.text }]
        }))
      )
      return [SKIP, index + pieces.length]
    })
  }
}

function sourceHolders(root: globalThis.Element) {
  return [...root.querySelectorAll<HTMLElement>("[data-source]")]
}

/** Where a selection boundary falls in the page's source text. */
function sourceOffset(root: globalThis.Element, node: Node, offset: number, edge: "start" | "end"): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const holder = node.parentElement?.closest<HTMLElement>("[data-source]")
    if (holder && root.contains(holder)) {
      const base = Number(holder.dataset.source)
      return holder.dataset.inexact === undefined ? base + Math.min(offset, node.textContent?.length ?? 0) : base
    }
  }
  // A boundary between elements: the nearest text after it for a start, before it for an end.
  const holders = sourceHolders(root)
  const boundary = document.createRange()
  boundary.setStart(node, offset)
  if (edge === "start") {
    const next = holders.find((holder) => boundary.comparePoint(holder, 0) >= 0)
    return next ? Number(next.dataset.source) : null
  }
  const previous = holders.findLast((holder) => boundary.comparePoint(holder, 0) < 0)
  return previous ? Number(previous.dataset.source) + (previous.textContent?.length ?? 0) : null
}

/** The source range of a selection inside the rendered page, or null when nothing on the page is selected. */
export function selectionRange(root: globalThis.Element, range: Range): SourceRange | null {
  if (range.collapsed || !root.contains(range.commonAncestorContainer)) {
    return null
  }
  const start = sourceOffset(root, range.startContainer, range.startOffset, "start")
  const end = sourceOffset(root, range.endContainer, range.endOffset, "end")
  return start !== null && end !== null && end > start ? { start, end } : null
}
