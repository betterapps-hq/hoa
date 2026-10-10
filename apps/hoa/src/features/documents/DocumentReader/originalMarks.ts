import { lineRects, rangeRects, type PageGeometry, type PageRect } from "@/documents/pageGeometry"
import type { Anchor, ReadingBlock } from "@/documents/reading"
import type { Tone } from "./DocumentReader.utils"

// What the original view marks on each page: the passages the text view tints (the cited provision, other citations,
// extra highlights), drawn over their words, and the words a search matches.

export type PageMark = PageRect & { tone: Tone | "match" }

/** A marked character range of one page's text. */
export type MarkedRange = { tone: Tone; start: number; end: number }

/** The marked ranges on each page of one upload, by page number. */
export function markedRanges(blocks: readonly ReadingBlock[], tones: ReadonlyMap<string, Tone>, fileId: string) {
  const byPage = new Map<number, MarkedRange[]>()
  for (const block of blocks) {
    const tone = tones.get(block.key)
    if (!tone || block.type === "page") {
      continue
    }
    for (const anchor of block.anchors.filter((item) => item.fileId === fileId)) {
      byPage.set(anchor.page, [...(byPage.get(anchor.page) ?? []), { tone, start: anchor.start, end: anchor.end }])
    }
  }
  return byPage
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replaceAll(/\p{Mark}/gu, "")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]/gu, "")

/** A page's marks: its marked ranges over their words, and each word a search word starts. */
export function pageMarks(
  geometry: PageGeometry,
  ranges: readonly MarkedRange[],
  words: readonly string[]
): PageMark[] {
  const marked = ranges.flatMap((range) =>
    rangeRects(geometry, range.start, range.end).map((rect) => ({ ...rect, tone: range.tone }))
  )
  const wanted = words.map(normalize).filter((word) => word !== "")
  const matches =
    wanted.length === 0
      ? []
      : geometry.words
          .filter((word) => {
            const text = normalize(word.text)
            return text !== "" && wanted.some((query) => text.startsWith(query))
          })
          .flatMap((word) => lineRects([word]).map((rect) => ({ ...rect, tone: "match" as const })))
  return [...marked, ...matches]
}

/** Where a block starts on the original: the page of its first anchor in this upload, and the range there. */
export function startOf(block: ReadingBlock | undefined, fileId: string): (Anchor & { hasRange: boolean }) | null {
  if (!block) {
    return null
  }
  const anchor = block.type === "page" ? undefined : block.anchors.find((item) => item.fileId === fileId)
  if (anchor) {
    return { ...anchor, hasRange: true }
  }
  return block.at?.fileId === fileId ? { ...block.at, start: 0, end: 0, hasRange: false } : null
}
