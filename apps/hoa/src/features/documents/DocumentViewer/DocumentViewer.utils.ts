import type { Element, Properties, Root, Text } from "hast"
import { SKIP, visit } from "unist-util-visit"

export type SourceRange = { start: number; end: number }

/** A passage to highlight: its exact range in the page's stored text. */
export type PageHighlight = {
  documentId: string
  pageIndex: number
  range: SourceRange
  /** Names the passage, so choosing it can say which; highlights without one aren't choosable. */
  id?: string
  /** Its color classes; the citation highlight by default. */
  tone?: string
}

export type HighlightRange = SourceRange & { id: string | null; tone: string | null }

/**
 * The highlights' ranges in order, without overlaps: where two overlap, the one that starts first keeps the shared
 * text, and identical neighbors (same id and tone) merge.
 */
export function highlightRanges(highlights: readonly Pick<PageHighlight, "range" | "id" | "tone">[]) {
  const sorted = highlights
    .filter((highlight) => highlight.range.end > highlight.range.start)
    .toSorted((a, b) => a.range.start - b.range.start || b.range.end - a.range.end)
  const ranges: HighlightRange[] = []
  for (const highlight of sorted) {
    const last = ranges.at(-1)
    const start = Math.max(highlight.range.start, last?.end ?? 0)
    if (start >= highlight.range.end) {
      continue
    }
    const id = highlight.id ?? null
    const tone = highlight.tone ?? null
    if (last && last.end === start && last.id === id && last.tone === tone) {
      last.end = highlight.range.end
    } else {
      ranges.push({ start, end: highlight.range.end, id, tone })
    }
  }
  return ranges
}

type Piece = { start: number; text: string; range: HighlightRange | null }

/** Splits a run of text that starts at `start` in the source into plain and highlighted pieces. */
export function splitByRanges(text: string, start: number, ranges: readonly HighlightRange[]): Piece[] {
  const pieces: Piece[] = []
  let cursor = 0
  for (const range of ranges) {
    const from = Math.max(range.start - start, cursor)
    const to = Math.min(range.end - start, text.length)
    if (to <= from) {
      continue
    }
    if (from > cursor) {
      pieces.push({ start: start + cursor, text: text.slice(cursor, from), range: null })
    }
    pieces.push({ start: start + from, text: text.slice(from, to), range })
    cursor = to
  }
  if (cursor < text.length) {
    pieces.push({ start: start + cursor, text: text.slice(cursor), range: null })
  }
  return pieces
}

const citationTone = "bg-amber-200/80 dark:bg-amber-400/25 dark:text-foreground"

function markProperties(range: HighlightRange, selectedId: string | null): Properties {
  return {
    className: [
      "rounded-sm",
      range.tone ?? citationTone,
      ...(range.id !== null && range.id === selectedId ? ["ring-2", "ring-ring"] : [])
    ],
    ...(range.id === null ? {} : { dataHighlight: range.id })
  }
}

/**
 * A rehype plugin for rendered Markdown: marks the highlighted ranges of the page's source text. A text node whose
 * rendered length differs from its source span (an escape or entity) is marked whole when a range touches it.
 */
export function rehypeHighlights(ranges: readonly HighlightRange[], selectedId: string | null = null) {
  return () => (tree: Root) => {
    if (ranges.length === 0) {
      return
    }
    visit(tree, "text", (node: Text, index, parent) => {
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      if (!parent || index === undefined || start === undefined || end === undefined || !node.value.trim()) {
        return
      }
      const isExact = end - start === node.value.length
      const touching = ranges.find((range) => range.start < end && range.end > start) ?? null
      const pieces = isExact ? splitByRanges(node.value, start, ranges) : [{ start, text: node.value, range: touching }]
      if (pieces.every((piece) => piece.range === null)) {
        return
      }
      parent.children.splice(
        index,
        1,
        ...pieces.map((piece): Element | Text =>
          piece.range
            ? {
                type: "element",
                tagName: "mark",
                properties: markProperties(piece.range, selectedId),
                children: [{ type: "text", value: piece.text }]
              }
            : { type: "text", value: piece.text }
        )
      )
      return [SKIP, index + pieces.length]
    })
  }
}
