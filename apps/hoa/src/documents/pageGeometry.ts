import type { LayoutResult } from "@/ocr/layoutResult"

// Where a page's words are on the page (encoding.md, UX, Reading): the OCR's word boxes aligned to the page record's
// text, so any character range of it (a provision's anchors, a search match) can be drawn on the original page.

/** A word's place in the page text, `[start, end)`, and its box on the page, in the page's units. */
export type WordBox = { text: string; start: number; end: number; x0: number; y0: number; x1: number; y1: number }

/** A page's size, in the units its word boxes use (inches for a PDF), and its words in reading order. */
export type PageGeometry = { page: number; width: number; height: number; words: WordBox[] }

/** A rectangle on a page, in its units. */
export type PageRect = { x: number; y: number; width: number; height: number }

type LayoutPage = LayoutResult["pages"][number]

const round = (value: number) => Math.round(value * 1000) / 1000

/**
 * A page's words with their boxes, each found in the page text after the one before it, as the page record's own
 * low-confidence spans are; words the text doesn't hold (a header the record dropped) are left out.
 */
export function pageGeometry(pageText: string, layoutPage: LayoutPage): PageGeometry | null {
  if (layoutPage.width === undefined || layoutPage.height === undefined) {
    return null
  }
  const words: WordBox[] = []
  let cursor = 0
  for (const word of layoutPage.words) {
    const { polygon } = word
    const start = pageText.indexOf(word.content, cursor)
    if (start === -1 || !polygon || polygon.length < 8) {
      continue
    }
    cursor = start + word.content.length
    const xs = polygon.filter((_, index) => index % 2 === 0)
    const ys = polygon.filter((_, index) => index % 2 === 1)
    words.push({
      text: word.content,
      start,
      end: cursor,
      x0: round(Math.min(...xs)),
      y0: round(Math.min(...ys)),
      x1: round(Math.max(...xs)),
      y1: round(Math.max(...ys))
    })
  }
  return { page: layoutPage.pageNumber, width: layoutPage.width, height: layoutPage.height, words }
}

/** Two boxes are on one line when they overlap vertically by more than half the shorter one's height. */
function isSameLine(a: WordBox, b: WordBox) {
  const overlap = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
  return overlap > 0.5 * Math.min(a.y1 - a.y0, b.y1 - b.y0) && b.x0 >= a.x0 - 0.01
}

/** Words merged into one rectangle per line they run along, in reading order. */
export function lineRects(words: readonly WordBox[]): PageRect[] {
  const lines: WordBox[] = []
  for (const word of words) {
    const last = lines.at(-1)
    if (last && isSameLine(last, word)) {
      lines[lines.length - 1] = {
        ...last,
        x0: Math.min(last.x0, word.x0),
        y0: Math.min(last.y0, word.y0),
        x1: Math.max(last.x1, word.x1),
        y1: Math.max(last.y1, word.y1)
      }
    } else {
      lines.push({ ...word })
    }
  }
  return lines.map((line) => ({ x: line.x0, y: line.y0, width: line.x1 - line.x0, height: line.y1 - line.y0 }))
}

/** The line rectangles a character range of the page text covers. */
export const rangeRects = (geometry: PageGeometry, start: number, end: number) =>
  lineRects(geometry.words.filter((word) => word.start < end && word.end > start))

/** Compact words for the wire: text, start, end and the box's corners. */
export type WordTuple = [string, number, number, number, number, number, number]

export const toTuples = (words: readonly WordBox[]): WordTuple[] =>
  words.map((word) => [word.text, word.start, word.end, word.x0, word.y0, word.x1, word.y1])

export const fromTuples = (tuples: readonly WordTuple[]): WordBox[] =>
  tuples.map(([text, start, end, x0, y0, x1, y1]) => ({ text, start, end, x0, y0, x1, y1 }))
