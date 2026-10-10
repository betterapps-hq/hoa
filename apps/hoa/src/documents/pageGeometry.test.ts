import { describe, expect, it } from "vitest"
import type { LayoutResult } from "@/ocr/layoutResult"
import { fromTuples, lineRects, pageGeometry, rangeRects, toTuples } from "./pageGeometry"

// A synthetic page, 8.5 by 11 inches: two lines of words, each word one inch wide and a fifth of an inch tall.
const text = "# Fences\n\nFences are wood. Gates swing in."

const word = (content: string, column: number, row: number) => ({
  content,
  confidence: 0.99,
  span: { offset: 0, length: content.length },
  polygon: [column, row, column + 1, row, column + 1, row + 0.2, column, row + 0.2]
})

const layoutPage: LayoutResult["pages"][number] = {
  pageNumber: 4,
  width: 8.5,
  height: 11,
  unit: "inch",
  spans: [],
  selectionMarks: [],
  words: [
    word("Fences", 1, 1),
    // A running head the page record dropped: it isn't in the text, so it has no place in it.
    word("CONFIDENTIAL", 6, 0.2),
    word("Fences", 1, 2),
    word("are", 2, 2),
    word("wood.", 3, 2),
    word("Gates", 1, 2.3),
    word("swing", 2, 2.3),
    word("in.", 3, 2.3)
  ]
}

describe("pageGeometry", () => {
  it("places each word in the page text after the one before it, with its box", () => {
    const geometry = pageGeometry(text, layoutPage)
    expect(geometry?.page).toBe(4)
    expect(geometry?.words.map((item) => [item.text, text.slice(item.start, item.end)])).toEqual([
      ["Fences", "Fences"],
      ["Fences", "Fences"],
      ["are", "are"],
      ["wood.", "wood."],
      ["Gates", "Gates"],
      ["swing", "swing"],
      ["in.", "in."]
    ])
    expect(geometry?.words[1]).toMatchObject({ start: 10, x0: 1, y0: 2, x1: 2, y1: 2.2 })
  })

  it("has nothing to place on a page without a size", () => {
    expect(pageGeometry(text, { ...layoutPage, width: undefined })).toBeNull()
  })

  it("marks a character range as one rectangle per line it runs along", () => {
    const geometry = pageGeometry(text, layoutPage)
    if (!geometry) {
      throw new Error("Expected the page's geometry.")
    }
    // "are wood. Gates": the end of one line and the start of the next.
    const start = text.indexOf("are")
    const rects = rangeRects(geometry, start, text.indexOf("Gates") + "Gates".length)
    expect(rects).toEqual([
      { x: 2, y: 2, width: 2, height: expect.closeTo(0.2) },
      { x: 1, y: 2.3, width: 1, height: expect.closeTo(0.2) }
    ])
    // "# Fences": the heading's word, not its Markdown mark.
    expect(rangeRects(geometry, 0, 1)).toEqual([])
    expect(rangeRects(geometry, 0, 8)).toEqual([{ x: 1, y: 1, width: 1, height: expect.closeTo(0.2) }])
    expect(lineRects([])).toEqual([])
  })

  it("sends words compactly and reads them back", () => {
    const geometry = pageGeometry(text, layoutPage)
    expect(fromTuples(toTuples(geometry?.words ?? []))).toEqual(geometry?.words)
  })
})
