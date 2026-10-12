import { describe, expect, it } from "vitest"
import type { LayoutResult } from "@/ocr/layoutResult"
import { syntheticPages } from "@/tests/syntheticDeclaration"
import { anchorsOf, cleanPages } from "./clean"

const texts = (lines: { text: string }[]) => lines.map((line) => line.text).filter(Boolean)

describe("cleanPages", () => {
  const pages = syntheticPages()
  const clean = cleanPages(pages)

  it("drops the cover and the table of contents", () => {
    expect(clean.droppedPages).toEqual([1, 2])
    expect(texts(clean.lines)).not.toContain("TABLE OF CONTENTS")
  })

  it("drops a line repeated on most pages even when its digits differ", () => {
    expect(texts(clean.lines).some((text) => text.startsWith("Recorded instrument"))).toBe(false)
  })

  it("drops a watermark scrap at the top of a page", () => {
    expect(texts(clean.lines)).not.toContain("Unoff")
  })

  it("marks headings and keeps their text without the Markdown", () => {
    expect(clean.lines.find((line) => line.text === "Article 1 General Provisions")?.headingLevel).toBe(2)
  })

  it("joins a word hyphenated across lines", () => {
    expect(texts(clean.lines)).toContain("This Declaration creates a plan of development for the community.")
  })

  it("joins a table row into one line attached to the paragraph before it", () => {
    const at = clean.lines.findIndex((line) => line.text === "The governing documents are:")
    expect(clean.lines[at + 1]?.text).toBe("Declaration sets the covenants")
  })

  it("restores a section heading the page header held", () => {
    const restored = clean.lines.find((line) => line.text === "32 Vehicles")
    expect(restored).toMatchObject({ page: 6, headingLevel: 1, pieces: [] })
  })

  it("maps every line back to its page text", () => {
    for (const line of clean.lines.filter((item) => item.pieces.length === 1)) {
      const [piece] = line.pieces
      const page = pages.find((item) => item.pageIndex === piece?.page)
      expect(page?.text.slice(piece?.start, piece?.end)).toBe(line.text)
    }
  })

  it("drops paragraphs Layout tagged as furniture and restores tagged headings", () => {
    const layout: LayoutResult = {
      content: "",
      pages: [],
      figures: [],
      paragraphs: [
        { role: "pageNumber", content: "21 Use of Lots", spans: [], boundingRegions: [{ pageNumber: 4 }] },
        {
          role: "pageFooter",
          content: '"Lot": A parcel shown on the plat.',
          spans: [],
          boundingRegions: [{ pageNumber: 4 }]
        }
      ]
    }
    const tagged = cleanPages(pages, [layout])
    expect(texts(tagged.lines)).toContain("21 Use of Lots")
    expect(texts(tagged.lines)).not.toContain('"Lot": A parcel shown on the plat.')
  })
})

describe("anchorsOf", () => {
  it("gives one range per page from the first piece to the last", () => {
    const pieces = [
      { page: 2, start: 40, end: 60 },
      { page: 1, start: 10, end: 20 },
      { page: 1, start: 22, end: 30 }
    ]
    expect(anchorsOf(pieces, "file-1")).toEqual([
      { fileId: "file-1", page: 1, start: 10, end: 30 },
      { fileId: "file-1", page: 2, start: 40, end: 60 }
    ])
  })
})
