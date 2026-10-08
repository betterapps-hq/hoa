import type { Section } from "@/documents/governingDocument"
import { pageMarker, type DocumentLayout, type Page } from "@/ocr/page"

export type StructuredSection = Omit<Section, "routing"> & {
  /** The section's text with a page marker before each page's part. */
  text: string
}

type Boundary = { pageIndex: number; offset: number; heading: string; level: number }

const numberPattern = /^(?:(?:section|article)\s+)?(\d+(?:\.\d+)*)\b/i

function stripMarkdown(line: string) {
  return line.replace(/^#+\s*/, "").trim()
}

/**
 * Repairs section numbers a scan read without their periods: "43" between 4.2 and 4.4 is 4.3
 * (docs/design/ocr.md, "First test").
 */
export function repairNumber(number: string, previous: string | null) {
  if (number.includes(".") || number.length < 2 || !previous?.includes(".")) {
    return number
  }
  const candidate = `${number[0]}.${number.slice(1)}`
  return candidate.split(".")[0] === previous.split(".")[0] ? candidate : number
}

function kindOf(heading: string): Section["kind"] {
  if (/^exhibit\b/i.test(heading)) {
    return "exhibit"
  }
  return /definition/i.test(heading) ? "definitions" : "body"
}

function sectionText(
  pages: readonly Page[],
  start: Boundary,
  end: Boundary | undefined,
  repeated: ReadonlySet<string>
) {
  const parts: string[] = []
  for (const page of pages) {
    if (page.pageIndex < start.pageIndex || (end && page.pageIndex > end.pageIndex)) {
      continue
    }
    const from = page.pageIndex === start.pageIndex ? start.offset : 0
    const to = end && page.pageIndex === end.pageIndex ? end.offset : page.text.length
    const body = page.text
      .slice(from, to)
      .split("\n")
      .filter((line) => !repeated.has(stripMarkdown(line)))
      .join("\n")
      .trim()
    if (body) {
      parts.push(`${pageMarker(page)}\n${body}`)
    }
  }
  return parts.join("\n\n")
}

function findReferences(
  text: string,
  sections: readonly { id: string; number: string | null; heading: string }[],
  selfId: string
) {
  const ids = new Set<string>()
  for (const match of text.matchAll(/\bExhibits?\s+([A-Z](?:\s*(?:,|and|to|-)\s*[A-Z])*)\b/g)) {
    const letters = (match[1] ?? "").match(/[A-Z]/g) ?? []
    for (const letter of letters) {
      const exhibit = sections.find((section) => new RegExp(`^exhibit\\s+${letter}\\b`, "i").test(section.heading))
      if (exhibit) {
        ids.add(exhibit.id)
      }
    }
  }
  for (const match of text.matchAll(/\b(?:RDG|Sections?|Articles?)\s+(\d+(?:\.\d+)*)/g)) {
    const target = sections.find((section) => section.number === match[1])
    if (target) {
      ids.add(target.id)
    }
  }
  if (/\bdefin(?:ed|itions?)\b/i.test(text)) {
    for (const section of sections) {
      if (kindOf(section.heading) === "definitions") {
        ids.add(section.id)
      }
    }
  }
  ids.delete(selfId)
  return [...ids]
}

/**
 * Splits a document's pages into sections at their headings (docs/design/extraction.md, "2. Structure"). Running
 * heads that repeat on most pages aren't headings; numbering a scan garbled is repaired from the outline.
 */
export function buildSections(documentId: string, pages: readonly Page[], layout: DocumentLayout): StructuredSection[] {
  const repeated = new Set(layout.repeatedLines)
  const ordered = pages.toSorted((a, b) => a.pageIndex - b.pageIndex)
  const boundaries: Boundary[] = ordered.flatMap((page) =>
    page.headings
      .filter((heading) => !repeated.has(stripMarkdown(heading.text)))
      .map((heading) => ({
        pageIndex: page.pageIndex,
        offset: heading.offset,
        heading: stripMarkdown(heading.text),
        level: heading.level
      }))
  )
  const first = ordered[0]
  const startsWithHeading = boundaries[0]?.pageIndex === first?.pageIndex && boundaries[0]?.offset === 0
  if (first && !startsWithHeading) {
    boundaries.unshift({ pageIndex: first.pageIndex, offset: 0, heading: "Front matter", level: 1 })
  }

  let previousNumber: string | null = null
  const drafts = boundaries.map((boundary, ordinal) => {
    const parsed = numberPattern.exec(boundary.heading)?.[1] ?? null
    const number = parsed ? repairNumber(parsed, previousNumber) : null
    previousNumber = number ?? previousNumber
    const next = boundaries[ordinal + 1]
    const lastPage = ordered.at(-1)
    return {
      id: `${documentId}:${ordinal}`,
      documentId,
      ordinal,
      number,
      heading: boundary.heading,
      kind: kindOf(boundary.heading),
      depth: number ? number.split(".").length : boundary.level,
      pageStart: boundary.pageIndex,
      pageEnd: next ? next.pageIndex : (lastPage?.pageIndex ?? boundary.pageIndex),
      startOffset: boundary.offset,
      endOffset: next ? next.offset : (lastPage?.text.length ?? 0),
      text: sectionText(ordered, boundary, next, repeated)
    }
  })

  return drafts
    .filter((draft) => draft.text.length > 0)
    .map((draft, _index, kept) => {
      const parent = kept.slice(0, kept.indexOf(draft)).findLast((candidate) => candidate.depth < draft.depth)
      const { depth: _depth, ...section } = draft
      return { ...section, parentId: parent?.id ?? null, references: findReferences(draft.text, kept, draft.id) }
    })
}
