import { describe, expect, it } from "vitest"
import { buildPages, computeDocumentLayout } from "./buildPages"
import guidelines from "./fixtures/guidelines-p16-17.json"
import { layoutResultSchema, type LayoutResult } from "./layoutResult"
import { normalizeForMatching, pageMarker, type Page } from "./page"

const options = {
  documentId: "guidelines-v1",
  engine: "azure-layout@2024-11-30",
  optionsHash: "hash",
  figureKey: (figureId: string) => `figures/${figureId}.png`,
  sectionAtStart: "5.2.5"
}

describe("buildPages on the sample guidelines (Layout output for pages 16 and 17)", () => {
  const pages = buildPages(layoutResultSchema.parse(guidelines), options)
  const [page16, page17] = pages

  it("writes one record per page with its printed label and footer", () => {
    expect(pages.map((page) => [page.pageIndex, page.pageLabel, page.labelSource])).toEqual([
      [16, "16", "page-number"],
      [17, "17", "page-number"]
    ])
    expect(page16?.footer).toBe("Board Approved: 12 November 2025")
  })

  it("keeps the body text and drops Layout's comment markers", () => {
    expect(page16?.text).toContain("5.3.2 Composite Fence Materials")
    expect(page16?.text).toContain("<table>")
    expect(page16?.text).not.toContain("<!--")
    expect(page17?.text).toContain("TREX: Winchester Grey and Saddle")
  })

  it("finds headings with their levels and carries the section across pages", () => {
    expect(page17?.headings.map((heading) => heading.text)).toContain("5.4.2 Composite Fence Colors")
    const colors = page17?.headings.find((heading) => heading.text === "5.4.2 Composite Fence Colors")
    expect(colors?.level).toBe(4)
    expect(page17?.text.slice(colors?.offset, (colors?.offset ?? 0) + 28)).toBe("5.4.2 Composite Fence Colors")
    expect(page16?.sectionAtTop).toBe("5.2.5")
    expect(page17?.sectionAtTop).toBe("5.3.2")
  })

  it("normalizes text for citation matching", () => {
    expect(page17?.normalizedText).toContain("trex winchester grey and saddle")
    expect(page16?.minConfidence).toBeGreaterThan(0.8)
    expect(page16?.lowConfidenceSpans).toEqual([])
  })
})

describe("buildPages details", () => {
  const content = '# Form\n\n☒ Before pictures\nOwner lowconf name\n<!-- PageNumber="3" -->'
  const result: LayoutResult = {
    content,
    pages: [
      {
        pageNumber: 1,
        spans: [{ offset: 0, length: content.length }],
        words: [
          { content: "Form", confidence: 0.99, span: { offset: 2, length: 4 } },
          { content: "lowconf", confidence: 0.4, span: { offset: 32, length: 7 } }
        ],
        selectionMarks: [{ state: "selected", span: { offset: 8, length: 1 } }]
      }
    ],
    paragraphs: [
      { role: "title", content: "Form", spans: [{ offset: 2, length: 4 }], boundingRegions: [{ pageNumber: 1 }] },
      { role: "pageHeader", content: "Recorded 2001", spans: [], boundingRegions: [{ pageNumber: 1 }] }
    ],
    figures: [{ id: "1.1", boundingRegions: [{ pageNumber: 1 }], caption: { content: "Plot plan" } }]
  }
  const [page] = buildPages(result, { ...options, sectionAtStart: null })

  it("reads checkbox labels, figures, headers and low-confidence words", () => {
    expect(page?.checkboxes).toEqual([{ label: "Before pictures", state: "selected" }])
    expect(page?.figures).toEqual([{ id: "1.1", caption: "Plot plan", imageKey: "figures/1.1.png" }])
    expect(page?.header).toBe("Recorded 2001")
    expect(page?.headings).toEqual([{ level: 1, text: "Form", offset: 2 }])
    const span = page?.lowConfidenceSpans[0]
    expect(page?.text.slice(span?.start, span?.end)).toBe("lowconf")
    expect(page?.minConfidence).toBe(0.4)
    expect(page?.pageLabel).toBeNull()
  })
})

describe("computeDocumentLayout", () => {
  const page = (pageIndex: number, pageLabel: string | null, text = "Body"): Page => ({
    documentId: "d",
    pageIndex,
    pageLabel,
    labelSource: pageLabel ? "page-number" : null,
    engine: "e",
    optionsHash: "h",
    text,
    normalizedText: text,
    header: null,
    footer: null,
    headings: [],
    sectionAtTop: null,
    checkboxes: [],
    figures: [],
    minConfidence: null,
    lowConfidenceSpans: []
  })

  it("labels pages from the most common offset and finds repeated lines", () => {
    const pages = [
      page(1, null, "Cover\nUnofficial copy"),
      page(7, "1", "Unofficial copy\nArticle 1"),
      page(8, "2", "Unofficial copy\nArticle 2"),
      page(9, null, "Unofficial copy\nArticle 3"),
      page(10, "X", "Exhibit")
    ]
    expect(computeDocumentLayout(pages)).toEqual({ labels: { "9": "3" }, repeatedLines: ["Unofficial copy"] })
  })

  it("leaves labels alone without a consistent offset", () => {
    expect(computeDocumentLayout([page(1, "5"), page(2, null)]).labels).toEqual({})
  })
})

describe("page helpers", () => {
  it("normalizes quotes, hyphenation, punctuation and spacing", () => {
    expect(normalizeForMatching("“Approved” Manu-\nfacturers:  TREX, <b>Saddle</b>.")).toBe(
      "approved manufacturers trex saddle"
    )
  })

  it("marks pages with and without printed labels", () => {
    expect(pageMarker({ pageIndex: 23, pageLabel: "17" })).toBe("<<page 23 | label 17>>")
    expect(pageMarker({ pageIndex: 1, pageLabel: null })).toBe("<<page 1>>")
  })
})
