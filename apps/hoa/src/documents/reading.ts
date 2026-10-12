import type { Page } from "@/ocr/page"
import { placeOutside, readingOrder, textOutsideProvisions, type ReadingPassage } from "@/rulebook/coverage"
import type * as T from "@/schema/types"
import type { GoverningDocument } from "./governingDocument"

// A governing document as the reader shows it (encoding.md, UX, Reading): its whole text in reading order, from its
// provisions where the build structured it (clean text, correct labels, headings by level) with the page text no
// provision holds filled in where it falls, or from its pages' OCR text when it has no provisions yet.

/** Where a block starts in an upload's pages. */
export type PageRef = { fileId: string; page: number }

/** A character range of an upload's page text. */
export type Anchor = T.Provision["anchors"][number]

/** One page of an upload, with the number printed on it when that differs from its position. */
export type ReadingPage = PageRef & { label: string | null }

export type ReadingBlock =
  | {
      type: "provision"
      /** The provision key, or the key with `/wrap-up` for the words that finish its children. */
      key: string
      provisionKey: T.ProvisionKey
      part: "main" | "wrap-up"
      depth: number
      /** The number as printed, "Article 4", "4.3" or "(b)"; null for counted paragraphs and wrap-ups. */
      number: string | null
      /** Set when the provision reads as a heading: its title, shown at `level`. */
      heading: string | null
      level: 2 | 3 | 4 | null
      /** Its words without the heading line or the printed number the label already shows. */
      text: string
      /** A lead-in that governs its children, after its text. */
      intro: string | null
      at: PageRef | null
      /** Where its words are in the page text, to mark them on the original page; none for a wrap-up. */
      anchors: Anchor[]
    }
  | { type: "outside"; key: string; depth: number; text: string; at: PageRef; anchors: Anchor[] }
  /** A whole page's OCR text as Markdown, for a document with no provisions. */
  | { type: "page"; key: string; text: string; at: PageRef }

/** An entry of the table of contents: the block it opens at. */
export type OutlineEntry = { key: string; number: string | null; title: string; level: 1 | 2 }

export type DocumentReading = {
  /** The upload's id, which the reader's URL and the original file use. */
  id: string
  title: string
  /** "Recorded 2001-12-04", or the upload's version and date when the build hasn't described its edition. */
  edition: string | null
  pageCount: number
  /** Whether the text comes from the document's provisions (true) or its pages' OCR text. */
  isStructured: boolean
  /** A later version of the same document, when this one has been replaced. */
  newerVersionId: string | null
  blocks: ReadingBlock[]
  outline: OutlineEntry[]
  pages: ReadingPage[]
  /** The uploads the text is read from, this one first, so a page marker can name another's. */
  files: { id: string; title: string }[]
  /** The uploaded PDF to show beside the text, and whether its words' positions were kept to mark passages on it. */
  original: { hasWordBoxes: boolean } | null
}

const letters = (text: string) => text.toLowerCase().replaceAll(/[^\p{L}\p{N}]/gu, "")

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "Article 4" for an article labeled `article-4`, "4.3" for a section, "(b)" for a point; null when nothing's printed. */
export function printedNumber(provision: Pick<T.Provision, "label" | "num">) {
  const [, name, rest] = /^([a-z]+)-([a-z0-9-]+)$/.exec(provision.label) ?? []
  if (name && rest) {
    return `${capitalize(name)} ${provision.num?.printed ?? (rest.length === 1 ? rest.toUpperCase() : rest)}`
  }
  return provision.num?.source === "printed" ? provision.num.printed : null
}

/** Whether a line says only the heading: "Article 1 Creation of the Community", "1.1 Purpose.", "PART ONE: INTRO". */
function isHeadingLine(line: string, provision: T.Provision, number: string | null) {
  const heading = provision.heading ?? ""
  const said = letters(line)
  const printed = provision.num?.printed ?? ""
  return (
    said !== "" &&
    [heading, `${number ?? ""}${heading}`, `${printed}${heading}`, `${provision.kind}${printed}${heading}`].some(
      (variant) => letters(variant) === said
    )
  )
}

/** The provision's words as the reader shows them under its label and heading. */
function bodyOf(provision: T.Provision, number: string | null, isHeading: boolean) {
  let text = provision.text.trim()
  if (isHeading) {
    const [first = "", ...rest] = text.split("\n")
    if (isHeadingLine(first, provision, number)) {
      text = rest.join("\n").trim()
    }
  }
  const printed = provision.num?.printed
  if (printed && text.startsWith(printed)) {
    text = text.slice(printed.length).trimStart()
  }
  return text
}

const pageOf = (anchor: T.Provision["anchors"][number] | undefined): PageRef | null =>
  anchor ? { fileId: anchor.fileId, page: anchor.page } : null

/** An article's heading is the top level, its sections' the next, anything deeper the last. */
function headingLevel(depth: number): 2 | 3 | 4 {
  if (depth === 0) {
    return 2
  }
  return depth === 1 ? 3 : 4
}

function blockOf(passage: ReadingPassage): ReadingBlock {
  if (passage.type === "outside") {
    const { fileId, page, start, end, text } = passage.passage
    return {
      type: "outside",
      key: passage.key,
      depth: passage.depth,
      text,
      at: { fileId, page },
      anchors: [{ fileId, page, start, end }]
    }
  }
  const { provision, depth } = passage
  const base = { type: "provision" as const, key: passage.key, provisionKey: provision.key, depth }
  if (passage.part === "wrap-up") {
    return {
      ...base,
      part: "wrap-up",
      number: null,
      heading: null,
      level: null,
      text: provision.wrapUp ?? "",
      intro: null,
      at: pageOf(provision.anchors.at(-1)),
      anchors: []
    }
  }
  const number = printedNumber(provision)
  // A definition's heading is the term its text already starts with.
  const isHeading = provision.heading !== null && provision.heading !== "" && provision.kind !== "definition"
  return {
    ...base,
    part: "main",
    number,
    heading: isHeading ? provision.heading : null,
    level: isHeading ? headingLevel(depth) : null,
    text: bodyOf(provision, number, isHeading),
    intro: provision.intro,
    at: pageOf(provision.anchors[0]),
    anchors: provision.anchors
  }
}

/** Provisions alone as the reader lays them out, with no page text: a document a running build has only structured. */
export function provisionBlocks(provisions: readonly T.Provision[]): ReadingBlock[] {
  return readingOrder(provisions).flatMap(({ passages }) => passages.map(blockOf))
}

export type ReadingInput = {
  upload: Pick<GoverningDocument, "id" | "title" | "version" | "effectiveDate" | "pageCount">
  /**
   * The rules schema's records of the documents the upload holds, in the order they're read: usually one, but a
   * declaration's upload can hold an exhibit that's a document of its own. Empty before a build has keyed it.
   */
  records: readonly T.GoverningDocument[]
  /** Every document's provisions: text another document holds isn't this one's outside text. */
  provisions: readonly T.Provision[]
  /** The pages of each upload the document's provisions point into, this upload's included. */
  pages: ReadonlyMap<string, readonly Page[]>
  /** The titles of those uploads. */
  fileTitles: ReadonlyMap<string, string>
  original: DocumentReading["original"]
  newerVersionId: string | null
}

const pageBlock = (page: Page): ReadingBlock => ({
  type: "page",
  key: `page:${page.documentId}:${page.pageIndex}`,
  text: page.text,
  at: { fileId: page.documentId, page: page.pageIndex }
})

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" })

function uploadEdition(upload: ReadingInput["upload"]) {
  const date = upload.effectiveDate ? new Date(upload.effectiveDate) : null
  const effective = date && !Number.isNaN(date.getTime()) ? `effective ${dateFormat.format(date)}` : null
  const version = upload.version > 1 ? `Version ${upload.version}` : null
  const parts = [version, effective].filter((part) => part !== null)
  return parts.length > 0 ? capitalize(parts.join(", ")) : null
}

/** The document an upload holds, ready to read. */
export function documentReading({
  upload,
  records,
  provisions,
  pages,
  fileTitles,
  newerVersionId,
  original
}: ReadingInput): DocumentReading {
  const [record] = records
  const ofRecord = (document: T.GoverningDocument) =>
    provisions.filter((provision) => provision.key.startsWith(`${document.key}:`))
  const own = records.flatMap(ofRecord)
  const pageList = [...pages.values()].flat()
  const base = {
    id: upload.id,
    title: record?.title ?? upload.title,
    edition: record?.edition?.label ?? uploadEdition(upload),
    pageCount: upload.pageCount ?? pages.get(upload.id)?.length ?? 0,
    newerVersionId,
    original,
    files: [upload.id, ...[...pages.keys()].filter((id) => id !== upload.id)].map((id) => ({
      id,
      title: id === upload.id ? upload.title : (fileTitles.get(id) ?? "Another file")
    })),
    pages: pageList.map((page) => ({ fileId: page.documentId, page: page.pageIndex, label: page.pageLabel }))
  }
  if (own.length === 0) {
    const ownPages = pages.get(upload.id) ?? []
    // A heading on most pages is a running head, not a part of the document.
    const counts = Map.groupBy(
      ownPages.flatMap((page) => [...new Set(page.headings.map((heading) => letters(heading.text)))]),
      (text) => text
    )
    const running = new Set(
      [...counts].filter(([, found]) => found.length >= 3 && found.length > ownPages.length / 3).map(([text]) => text)
    )
    return {
      ...base,
      isStructured: false,
      blocks: ownPages.map(pageBlock),
      outline: ownPages.flatMap((page) =>
        page.headings
          .filter(
            (heading) => heading.level <= 2 && letters(heading.text) !== "" && !running.has(letters(heading.text))
          )
          .map((heading) => ({
            key: `page:${page.documentId}:${page.pageIndex}`,
            number: null,
            title: heading.text.replaceAll(/[#*_]/g, "").trim(),
            level: heading.level <= 1 ? (1 as const) : (2 as const)
          }))
      )
    }
  }
  const sourceText = [...pages].map(([fileId, filePages]) => textOutsideProvisions(fileId, filePages, provisions))
  const outsideAfter = placeOutside(provisions, sourceText)
  // Pages cleaning skipped as front matter (a cover, a recording stamp) come first, as they were read.
  const skipped = new Set(sourceText.find((source) => source.fileId === upload.id)?.skippedPages ?? [])
  const frontMatter = (pages.get(upload.id) ?? []).filter((page) => skipped.has(page.pageIndex)).map(pageBlock)
  const blocks = [
    ...frontMatter,
    ...records.flatMap((document) =>
      readingOrder(ofRecord(document), outsideAfter).flatMap(({ passages }) => passages.map(blockOf))
    )
  ]
  return {
    ...base,
    isStructured: true,
    blocks,
    outline: blocks.flatMap((block): OutlineEntry[] =>
      block.type === "provision" && block.part === "main" && block.heading && block.depth <= 1
        ? [{ key: block.key, number: block.number, title: block.heading, level: block.depth === 0 ? 1 : 2 }]
        : []
    )
  }
}
