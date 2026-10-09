import type { LayoutResult } from "@/ocr/layoutResult"
import type { Page } from "@/ocr/page"
import type { Provision } from "@/schema/types"
import { isMarkerOnly } from "./numbering"

// Clean (encoding.md, Structure 1): a document's page text without page furniture, as lines that remember where on
// which page each part came from, so provisions can carry anchors into the page records.

/** A run of a page record's text: `start` and `end` are offsets in `page.text`. */
export type PagePiece = { page: number; start: number; end: number }

/** A cleaned line; an empty text is a blank line, which separates paragraphs. */
export type CleanLine = { text: string; page: number; headingLevel: number | null; pieces: PagePiece[] }

export type CleanDocument = { lines: CleanLine[]; droppedPages: number[] }

type RawLine = { text: string; start: number; end: number }
type RawPage = { page: number; lines: RawLine[] }

const furnitureRoles = new Set(["pageHeader", "pageFooter", "pageNumber"])
const repeatedShare = 0.3
const structuralTag = /^<\/?(table|tbody|thead|tr|figure|figcaption)>$/
const cellPattern = /^<(td|th)[^>]*>(.*)<\/\1>$/
const pageNote = /^[[(][A-Z ]*\bPAGES?\b[A-Z ]*[\])]$/
const fragment = /^[A-Za-z][A-Za-z.]{0,9}$/

function splitLines(text: string): RawLine[] {
  const lines: RawLine[] = []
  let start = 0
  for (const line of text.split("\n")) {
    lines.push({ text: line, start, end: start + line.length })
    start += line.length + 1
  }
  return lines
}

const withoutHashes = (text: string) => text.replace(/^#+\s*/, "").trim()

/** Lines compared across pages: digits and spacing don't count, so "2001 120 4001459" and "2004 120 4001459" agree. */
function repetitionKey(text: string) {
  return withoutHashes(text).toLowerCase().replace(/\d/g, "0").replace(/\s+/g, " ")
}

/** What Layout tagged as page headers, footers and numbers, per page: from its paragraphs, or the page records. */
function taggedParagraphs(pages: readonly Page[], layouts: readonly LayoutResult[]) {
  const byPage = new Map<number, string[]>()
  const add = (page: number, content: string) => byPage.set(page, [...(byPage.get(page) ?? []), content.trim()])
  if (layouts.length > 0) {
    for (const paragraph of layouts.flatMap((layout) => layout.paragraphs)) {
      const page = paragraph.boundingRegions[0]?.pageNumber
      if (page !== undefined && paragraph.role && furnitureRoles.has(paragraph.role)) {
        add(page, paragraph.content)
      }
    }
    return byPage
  }
  for (const page of pages) {
    for (const content of [page.header, page.footer, page.pageLabel].flatMap((value) => value?.split("\n") ?? [])) {
      add(page.pageIndex, content)
    }
  }
  return byPage
}

/** Layout sometimes tags a section heading at the top of a page as its header or page number ("33 Authority to …"). */
const taggedHeading = /^(?:[A-Za-z]{1,3}\s+)?\d{1,3}(?:[.\s-]?\d{1,3})?\.?\s+\p{Lu}[\p{L}\s,;'’-]{3,}\.?$/u

/** A table of contents: its title, or a page whose lines are mostly bare page numbers. */
function isContents(page: RawPage) {
  const lines = page.lines.map((line) => withoutHashes(line.text)).filter(Boolean)
  if (lines.some((line) => /^table of contents$/i.test(line))) {
    return true
  }
  const pageNumbers = lines.filter((line) => /^[.\s]*\d{1,3}$/.test(line)).length
  return pageNumbers >= 8 && pageNumbers >= lines.length * 0.3
}

/** Pages up to the last contents page near the start (a cover, a title page, the contents) aren't the text. */
function frontMatterEnd(pages: readonly RawPage[]) {
  const searched = pages.slice(0, Math.ceil(pages.length * 0.3))
  const last = searched.findLastIndex(isContents)
  return last + 1
}

function repeatedKeys(pages: readonly RawPage[]) {
  const counts = new Map<string, number>()
  for (const page of pages) {
    const keys = new Set(
      page.lines
        .filter((line) => !isMarkerOnly(withoutHashes(line.text)))
        .map((line) => repetitionKey(line.text))
        .filter((key) => key.length >= 3)
    )
    for (const key of keys) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  const needed = Math.max(3, Math.ceil(pages.length * repeatedShare))
  return new Set([...counts].filter(([, count]) => count >= needed).map(([key]) => key))
}

/** Stamps and notes no layout role caught: lines with no letters (other than markers) and "[SIGNATURES ON NEXT PAGE]". */
function isFurniture(text: string) {
  const content = withoutHashes(text)
  if (content === "") {
    return false
  }
  const isStamp = !/\p{L}{3}/u.test(content) && (content.match(/\d/g)?.length ?? 0) >= 4
  if ((!/\p{L}/u.test(content) || isStamp) && !isMarkerOnly(content)) {
    return true
  }
  return pageNote.test(content)
}

/** A watermark fragment ("Unoff", "Ure") alone at the top or bottom of a page. */
function dropEdgeFragments(lines: RawLine[]) {
  const nonBlank = lines.filter((line) => line.text.trim() !== "")
  const first = nonBlank[0]
  const second = nonBlank[1]
  if (
    first &&
    second &&
    fragment.test(first.text.trim()) &&
    /^[A-Z]/.test(first.text.trim()) &&
    !isMarkerOnly(first.text)
  ) {
    lines.splice(lines.indexOf(first), 1)
  }
  const lastIndex = lines.findLastIndex((line) => line.text.trim() !== "")
  const last = lines[lastIndex]
  const isIsolated = lastIndex > 0 && lines[lastIndex - 1]?.text.trim() === ""
  if (last && isIsolated && fragment.test(last.text.trim()) && !isMarkerOnly(last.text)) {
    lines.splice(lastIndex, 1)
  }
}

const blank = (page: number): CleanLine => ({ text: "", page, headingLevel: null, pieces: [] })

/** One page's lines as clean lines: headings marked, table rows joined into one line each, tags removed. */
function cleanPageLines(page: number, lines: readonly RawLine[]) {
  const out: CleanLine[] = []
  let row: CleanLine | null = null
  for (const line of lines) {
    const trimmed = line.text.trim()
    if (trimmed === "") {
      if (!row) {
        out.push(blank(page))
      }
      continue
    }
    if (structuralTag.test(trimmed)) {
      if (trimmed === "<table>") {
        while (out.at(-1)?.text === "") {
          out.pop()
        }
      }
      if (trimmed === "<tr>") {
        row = { text: "", page, headingLevel: null, pieces: [] }
      }
      if (trimmed === "</tr>" && row) {
        out.push(row)
        row = null
      }
      continue
    }
    const offset = line.start + (line.text.length - line.text.trimStart().length)
    const cell = cellPattern.exec(trimmed)
    if (cell && row) {
      const content = cell[2]?.trim() ?? ""
      const start = offset + trimmed.indexOf(content)
      row.text = row.text ? `${row.text} ${content}` : content
      row.pieces.push({ page, start, end: start + content.length })
      continue
    }
    const hashes = /^(#+)\s+/.exec(trimmed)
    const content = trimmed
      .slice(hashes?.[0].length ?? 0)
      .replace(/<[^>]+>/g, "")
      .trim()
    const start = offset + (hashes?.[0].length ?? 0)
    out.push({
      text: content,
      page,
      headingLevel: hashes?.[1]?.length ?? null,
      pieces: [{ page, start, end: start + trimmed.length - (hashes?.[0].length ?? 0) }]
    })
  }
  return out
}

/** Joins a word broken across lines: "devel-" + "opment" is "development"; "By-" + "Laws" keeps its hyphen. */
function joinHyphens(lines: CleanLine[]) {
  const joined: CleanLine[] = []
  for (const line of lines) {
    const previous = joined.at(-1)
    const isBroken =
      previous && previous.headingLevel === null && line.headingLevel === null && /[A-Za-z]-$/.test(previous.text)
    if (!previous || !isBroken || !/^[A-Za-z]/.test(line.text)) {
      joined.push({ ...line, pieces: [...line.pieces] })
      continue
    }
    if (/^[a-z]/.test(line.text)) {
      previous.text = previous.text.slice(0, -1) + line.text
      const last = previous.pieces.at(-1)
      if (last) {
        last.end -= 1
      }
    } else {
      previous.text += line.text
    }
    previous.pieces.push(...line.pieces)
  }
  return joined
}

/**
 * Cleans a document's pages (encoding.md, Structure 1): drops the front matter before a table of contents, the
 * paragraphs Layout tags as page headers, footers and numbers, lines repeated on at least 30 percent of pages, stamps
 * and watermark fragments; marks headings; joins table rows and hyphenated line breaks.
 */
export function cleanPages(pages: readonly Page[], layouts: readonly LayoutResult[] = []): CleanDocument {
  const raw = pages
    .toSorted((a, b) => a.pageIndex - b.pageIndex)
    .map((page): RawPage => ({ page: page.pageIndex, lines: splitLines(page.text) }))
  const front = frontMatterEnd(raw)
  const kept = raw.slice(front)
  const tagged = taggedParagraphs(pages, layouts)
  const repeated = repeatedKeys(kept)
  const lines = kept.flatMap(({ page, lines: pageLines }) => {
    const roles = tagged.get(page) ?? []
    const remaining = pageLines.filter(
      (line) => !roles.includes(line.text.trim()) && !isFurniture(line.text) && !repeated.has(repetitionKey(line.text))
    )
    dropEdgeFragments(remaining)
    const headings = roles
      .filter((content) => taggedHeading.test(content))
      .map((content): CleanLine => ({ text: content, page, headingLevel: 1, pieces: [] }))
    return [...headings, ...cleanPageLines(page, remaining)]
  })
  return { lines: joinHyphens(lines), droppedPages: raw.slice(0, front).map(({ page }) => page) }
}

/** A provision's anchors from the pieces of its lines: one range per page, from the first piece to the last. */
export function anchorsOf(pieces: readonly PagePiece[], fileId: string): Provision["anchors"] {
  const byPage = new Map<number, { start: number; end: number }>()
  for (const piece of pieces) {
    const range = byPage.get(piece.page)
    byPage.set(
      piece.page,
      range ? { start: Math.min(range.start, piece.start), end: Math.max(range.end, piece.end) } : { ...piece }
    )
  }
  return [...byPage]
    .toSorted(([a], [b]) => a - b)
    .map(([page, range]) => ({ fileId, page, start: range.start, end: range.end }))
}
