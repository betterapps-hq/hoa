import type { DocumentReading, PageRef, ReadingBlock, ReadingPage } from "@/documents/reading"

// The reader's derived data: page markers between blocks, the headings each block sits under, and the words a search
// marks in a block's text.

/** "Page 15, printed 9": a page's position, and its printed number when that differs. */
export function pageName(page: ReadingPage, fileTitle?: string) {
  const position = `${fileTitle ? `${fileTitle}, page` : "Page"} ${page.page}`
  return page.label && page.label !== String(page.page) ? `${position}, printed ${page.label}` : position
}

const pageKey = (ref: PageRef) => `${ref.fileId}:${ref.page}`

/** Each block's page marker: the page it starts on, when that's a page no earlier block started on. */
export function pageMarkers(reading: Pick<DocumentReading, "blocks" | "pages">) {
  const pages = new Map(reading.pages.map((page) => [pageKey(page), page]))
  const markers = new Map<string, ReadingPage>()
  const seen = new Set<string>()
  let last: PageRef | null = null
  for (const block of reading.blocks) {
    const { at } = block
    // Pages only move forward: a block anchored back on an earlier page (a wrap-up, an amendment) keeps the reader's place.
    if (!at || seen.has(pageKey(at)) || (last && at.fileId === last.fileId && at.page < last.page)) {
      continue
    }
    seen.add(pageKey(at))
    last = at
    markers.set(block.key, pages.get(pageKey(at)) ?? { ...at, label: null })
  }
  return markers
}

/** The heading a block is under at each level: its article (or part) and its section. */
export type BlockContext = { article: ReadingBlock | null; section: ReadingBlock | null }

export function blockContexts(blocks: readonly ReadingBlock[]) {
  const contexts = new Map<string, BlockContext>()
  let article: ReadingBlock | null = null
  let section: ReadingBlock | null = null
  for (const block of blocks) {
    if (block.type === "provision" && block.part === "main" && block.heading !== null && block.depth <= 1) {
      if (block.depth === 0) {
        article = block
        section = null
      } else {
        section = block
      }
    } else if (block.type === "provision" && block.depth === 0) {
      article = block
      section = null
    }
    contexts.set(block.key, { article, section })
  }
  return contexts
}

/** "Article 4 Architectural control": a heading block's number and title, or what stands for them. */
export function blockTitle(block: ReadingBlock) {
  if (block.type !== "provision") {
    return null
  }
  return [block.number, block.heading].filter((part) => part !== null && part !== "").join(" ") || null
}

const stopWords = new Set(["a", "an", "and", "as", "at", "be", "by", "for", "in", "is", "of", "on", "or", "the", "to"])

/** The words of a query worth marking in the text: no one-letter words, and no common words beside others. */
export function queryWords(query: string) {
  const words = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1)
  const others = words.filter((word) => !stopWords.has(word))
  return [...new Set(others.length > 0 ? others : words)]
}

const escape = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Where the query's words start words of the text, as character ranges: each word matched as a prefix. */
export function wordRanges(text: string, words: readonly string[]) {
  if (words.length === 0) {
    return []
  }
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${words
      .toSorted((a, b) => b.length - a.length)
      .map(escape)
      .join("|")})[\\p{L}\\p{N}]*`,
    "giu"
  )
  return [...text.matchAll(pattern)].map((match) => ({ start: match.index, end: match.index + match[0].length }))
}

/** A text split into plain and marked pieces at the ranges. */
export function splitAt(text: string, ranges: readonly { start: number; end: number }[]) {
  const pieces: { text: string; isMarked: boolean }[] = []
  let at = 0
  for (const range of ranges) {
    if (range.start > at) {
      pieces.push({ text: text.slice(at, range.start), isMarked: false })
    }
    pieces.push({ text: text.slice(range.start, range.end), isMarked: true })
    at = range.end
  }
  if (at < text.length) {
    pieces.push({ text: text.slice(at), isMarked: false })
  }
  return pieces
}

/** A few words of text around its first match, for a search result: "…the fence shall not exceed six feet…". */
export function snippetOf(text: string, words: readonly string[], length = 140) {
  const plain = text
    .replaceAll(/<[^>]*>/g, " ")
    .replaceAll(/[#*_|]/g, "")
    .replaceAll(/\s+/g, " ")
    .trim()
  const first = wordRanges(plain, words)[0]
  if (!first || plain.length <= length) {
    return plain.length <= length ? plain : `${plain.slice(0, length).trimEnd()}…`
  }
  const from = Math.max(0, first.start - Math.floor(length / 3))
  const start = from === 0 ? 0 : plain.indexOf(" ", from) + 1 || from
  const slice = plain.slice(start, start + length).trimEnd()
  return `${start > 0 ? "…" : ""}${slice}${start + length < plain.length ? "…" : ""}`
}

/** The blocks in groups the browser can skip laying out while they're off screen: each article, or each page. */
export function groupsOf(blocks: readonly ReadingBlock[]) {
  const groups: { key: string; blocks: ReadingBlock[] }[] = []
  for (const block of blocks) {
    // An article opens a group; top-level provisions without a heading flow on in the group before them, so a document
    // with no articles reads as one text instead of a group (and its space) per provision.
    const startsGroup =
      block.type === "page" ||
      (block.type === "provision" && block.depth === 0 && block.part === "main" && block.heading !== null)
    const last = groups.at(-1)
    if (!last || startsGroup) {
      groups.push({ key: block.key, blocks: [block] })
    } else {
      last.blocks.push(block)
    }
  }
  return groups
}

export type Tone = "target" | "related"

/**
 * How each block is marked: a marked provision marks everything under it too (a section's paragraphs, its wrap-up), so
 * a cited heading brings its text with it. The provision opened at wins over a quieter mark around it.
 */
export function blockTones(blocks: readonly ReadingBlock[], toneOf: (provisionKey: string) => Tone | null) {
  const tones = new Map<string, Tone>()
  // The marked provisions the reader is inside, outermost first.
  const open: { tone: Tone; depth: number; key: string }[] = []
  for (const block of blocks) {
    const depth = block.type === "page" ? 0 : block.depth
    while (open.length > 0) {
      const last = open.at(-1)
      if (!last || depth > last.depth || block.key === `${last.key}/wrap-up`) {
        break
      }
      open.pop()
    }
    const own = block.type === "provision" && block.part === "main" ? toneOf(block.provisionKey) : null
    if (own && block.type === "provision") {
      open.push({ tone: own, depth: block.depth, key: block.provisionKey })
    }
    const tone = open.some((item) => item.tone === "target") ? "target" : open.at(-1)?.tone
    if (tone) {
      tones.set(block.key, tone)
    }
  }
  return tones
}

/** A group's blocks in runs of the same mark, so a marked passage is one tinted region. */
export function runsOf(blocks: readonly ReadingBlock[], tones: ReadonlyMap<string, Tone>) {
  const runs: { tone: Tone | null; blocks: ReadingBlock[] }[] = []
  for (const block of blocks) {
    const tone = tones.get(block.key) ?? null
    const last = runs.at(-1)
    if (last && last.tone === tone) {
      last.blocks.push(block)
    } else {
      runs.push({ tone, blocks: [block] })
    }
  }
  return runs
}
