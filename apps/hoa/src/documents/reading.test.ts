import { describe, expect, it } from "vitest"
import type { Page } from "@/ocr/page"
import type * as T from "@/schema/types"
import { documentReading, outlineOf, printedNumber, provisionBlocks, type ReadingInput } from "./reading"

// A synthetic two-page document: an article with a section, two points and a counted paragraph, and a line of page
// text no provision holds.

const pageText = {
  1: "ARTICLE 1 GENERAL MATTERS\n\n1.1 Scope. The owner keeps the yard tidy.\n\n(a) Lawns are mowed.",
  2: "(b) Hedges are trimmed.\n\nA note the build placed in no provision.\n\nThese duties bind every owner."
}

const page = (pageIndex: 1 | 2, overrides: Partial<Page> = {}): Page => ({
  documentId: "upload-1",
  pageIndex,
  pageLabel: pageIndex === 2 ? "ii" : null,
  labelSource: null,
  engine: "test",
  optionsHash: "test",
  text: pageText[pageIndex],
  normalizedText: pageText[pageIndex].toLowerCase(),
  header: null,
  footer: null,
  headings: [],
  sectionAtTop: null,
  checkboxes: [],
  figures: [],
  minConfidence: null,
  lowConfidenceSpans: [],
  ...overrides
})

const anchor = (pageIndex: 1 | 2, text: string) => {
  const start = pageText[pageIndex].indexOf(text)
  return { fileId: "upload-1", page: pageIndex, start, end: start + text.length }
}

const provision = (overrides: Partial<T.Provision> & Pick<T.Provision, "key" | "label" | "text">): T.Provision => ({
  kind: "section",
  num: null,
  heading: null,
  parentLabel: null,
  intro: null,
  wrapUp: null,
  anchors: [],
  noRule: null,
  ...overrides
})

const provisions: T.Provision[] = [
  // Stored out of order: the reader orders siblings by where their pages hold them.
  provision({
    key: "rules:1.1(b)",
    label: "1.1(b)",
    kind: "point",
    parentLabel: "1.1",
    num: { printed: "(b)", normalized: "b", source: "printed" },
    text: "(b) Hedges are trimmed.",
    anchors: [anchor(2, "(b) Hedges are trimmed.")]
  }),
  provision({
    key: "rules:article-1",
    label: "article-1",
    kind: "article",
    heading: "General Matters",
    num: { printed: "1", normalized: "1", source: "printed" },
    text: "ARTICLE 1 GENERAL MATTERS",
    anchors: [anchor(1, "ARTICLE 1 GENERAL MATTERS")]
  }),
  provision({
    key: "rules:1.1",
    label: "1.1",
    parentLabel: "article-1",
    heading: "Scope",
    num: { printed: "1.1", normalized: "1.1", source: "printed" },
    text: "1.1 Scope.\nThe owner keeps the yard tidy.",
    wrapUp: "These duties bind every owner.",
    anchors: [anchor(1, "1.1 Scope. The owner keeps the yard tidy."), anchor(2, "These duties bind every owner.")]
  }),
  provision({
    key: "rules:1.1(a)",
    label: "1.1(a)",
    kind: "point",
    parentLabel: "1.1",
    num: { printed: "(a)", normalized: "a", source: "printed" },
    text: "Lawns are mowed.",
    anchors: [anchor(1, "(a) Lawns are mowed.")]
  })
]

const record: T.GoverningDocument = {
  key: "rules",
  kind: "rules",
  title: "Community Rules",
  issuedBy: null,
  governs: null,
  edition: {
    label: "Board approved 2026-01-05",
    adoptedOn: null,
    adoptedBy: null,
    effectiveFrom: "2026-01-05",
    basis: "original",
    files: [],
    recording: null
  }
}

const input = (overrides: Partial<ReadingInput> = {}): ReadingInput => ({
  upload: { id: "upload-1", title: "Rules (scan)", version: 1, effectiveDate: null, pageCount: 2 },
  records: [record],
  provisions,
  pages: new Map([["upload-1", [page(1), page(2)]]]),
  fileTitles: new Map([["upload-1", "Rules (scan)"]]),
  newerVersionId: null,
  removedAt: null,
  original: { hasWordBoxes: true },
  ...overrides
})

describe("outlineOf", () => {
  it("lists a document of numbered paragraphs with no headings by their numbers and first words", () => {
    const paragraph = (label: string, text: string) =>
      provision({
        key: `covenants:${label}`,
        label,
        num: { printed: label, normalized: label, source: "printed" },
        text
      })
    const blocks = provisionBlocks([
      paragraph("1", "These covenants bind every lot shown on the recorded plat."),
      paragraph("2", "No lot may be divided.")
    ])
    expect(outlineOf(blocks)).toEqual([
      { key: "covenants:1", number: "1", title: "These covenants bind every lot shown…", level: 2 },
      { key: "covenants:2", number: "2", title: "No lot may be divided.", level: 2 }
    ])
  })
})

describe("documentReading", () => {
  it("reads the provisions in page order, headings by level, numbers without repeating them", () => {
    const reading = documentReading(input())
    expect(reading).toMatchObject({
      title: "Community Rules",
      edition: "Board approved 2026-01-05",
      isStructured: true
    })
    const shown = reading.blocks.map((block) =>
      block.type === "provision"
        ? [block.key, block.number, block.heading, block.level, block.text, block.depth]
        : [block.type, block.text]
    )
    expect(shown).toEqual([
      ["rules:article-1", "Article 1", "General Matters", 2, "", 0],
      ["rules:1.1", "1.1", "Scope", 3, "The owner keeps the yard tidy.", 1],
      ["rules:1.1(a)", "(a)", null, null, "Lawns are mowed.", 2],
      ["rules:1.1(b)", "(b)", null, null, "Hedges are trimmed.", 2],
      ["outside", "A note the build placed in no provision."],
      ["rules:1.1/wrap-up", null, null, null, "These duties bind every owner.", 1]
    ])
    expect(reading.outline).toEqual([
      { key: "rules:article-1", number: "Article 1", title: "General Matters", level: 1 },
      { key: "rules:1.1", number: "1.1", title: "Scope", level: 2 }
    ])
    expect(reading.pages).toEqual([
      { fileId: "upload-1", page: 1, label: null },
      { fileId: "upload-1", page: 2, label: "ii" }
    ])
  })

  it("reads a document no build has structured from its pages, leaving running heads out of the outline", () => {
    const heading = (text: string) => ({ level: 1, text, offset: 0 })
    const pages = [1, 2, 3, 4].map((index) =>
      page(index === 1 ? 1 : 2, {
        pageIndex: index,
        text: `# Running head\n\nPage ${index} text`,
        headings: [heading("Running head"), ...(index === 2 ? [heading("Fences")] : [])]
      })
    )
    const reading = documentReading(input({ records: [], pages: new Map([["upload-1", pages]]) }))
    expect(reading.isStructured).toBe(false)
    expect(reading.blocks.map((block) => block.type)).toEqual(["page", "page", "page", "page"])
    expect(reading.outline).toEqual([{ key: "page:upload-1:2", number: null, title: "Fences", level: 1 }])
    expect(reading.edition).toBeNull()
  })

  it("names an upload's edition by its version and date when no build has described it", () => {
    const reading = documentReading(
      input({
        records: [],
        upload: { id: "upload-1", title: "Rules", version: 2, effectiveDate: "2026-03-01", pageCount: 2 }
      })
    )
    expect(reading.edition).toBe("Version 2, effective Mar 1, 2026")
  })
})

describe("provisionBlocks", () => {
  it("lays out the provisions alone, in reading order, as a running build has them before the page text", () => {
    expect(provisionBlocks(provisions).map((block) => block.key)).toEqual([
      "rules:article-1",
      "rules:1.1",
      "rules:1.1(a)",
      "rules:1.1(b)",
      "rules:1.1/wrap-up"
    ])
  })
})

describe("printedNumber", () => {
  it("names a part by its kind and a point by its printed number, and nothing for a counted paragraph", () => {
    expect(printedNumber({ label: "exhibit-c", num: null })).toBe("Exhibit C")
    expect(printedNumber({ label: "4.3(b)", num: { printed: "(b)", normalized: "b", source: "printed" } })).toBe("(b)")
    expect(printedNumber({ label: "4.3/p2", num: { printed: null, normalized: "2", source: "counted" } })).toBeNull()
  })
})
