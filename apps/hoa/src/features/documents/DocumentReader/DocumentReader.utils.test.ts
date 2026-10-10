import { describe, expect, it } from "vitest"
import type { ReadingBlock } from "@/documents/reading"
import {
  blockContexts,
  blockTitle,
  blockTones,
  groupsOf,
  pageMarkers,
  pageName,
  queryWords,
  runsOf,
  snippetOf,
  splitAt,
  wordRanges,
  type Tone
} from "./DocumentReader.utils"
import { markedRanges, pageMarks, startOf } from "./originalMarks"

const at = (page: number) => ({ fileId: "upload-1", page })

const provision = (
  key: string,
  depth: number,
  page: number,
  overrides: Partial<Extract<ReadingBlock, { type: "provision" }>> = {}
): ReadingBlock => ({
  type: "provision",
  key,
  provisionKey: key.replace("/wrap-up", ""),
  part: key.endsWith("/wrap-up") ? "wrap-up" : "main",
  depth,
  number: null,
  heading: null,
  level: null,
  text: `${key} text`,
  intro: null,
  at: at(page),
  anchors: [{ fileId: "upload-1", page, start: 0, end: 4 }],
  ...overrides
})

const blocks: ReadingBlock[] = [
  provision("doc:article-1", 0, 1, { number: "Article 1", heading: "General", level: 2 }),
  provision("doc:1.1", 1, 1, { number: "1.1", heading: "Scope", level: 3 }),
  provision("doc:1.1(a)", 2, 2, { number: "(a)" }),
  provision("doc:1.1/wrap-up", 1, 2, { anchors: [] }),
  provision("doc:1.2", 1, 3, { number: "1.2", heading: "Fences", level: 3 }),
  provision("doc:article-2", 0, 3, { number: "Article 2", heading: "Use", level: 2 })
]

describe("the reader's derived data", () => {
  it("marks each page where its first block starts, with its printed number", () => {
    const markers = pageMarkers({ blocks, pages: [{ ...at(3), label: "1" }] })
    expect([...markers.keys()]).toEqual(["doc:article-1", "doc:1.1(a)", "doc:1.2"])
    expect(pageName(markers.get("doc:1.2") ?? { ...at(3), label: null })).toBe("Page 3, printed 1")
    expect(pageName({ ...at(2), label: "2" }, "Amendment")).toBe("Amendment, page 2")
  })

  it("knows the article and section each block is under, and titles headings", () => {
    const contexts = blockContexts(blocks)
    expect(contexts.get("doc:1.1(a)")?.section?.key).toBe("doc:1.1")
    expect(contexts.get("doc:article-2")).toMatchObject({ article: { key: "doc:article-2" }, section: null })
    expect(blockTitle(blocks[1] ?? blocks[0]!)).toBe("1.1 Scope")
  })

  it("marks a provision with everything under it, and the passage opened at over a quieter mark", () => {
    const marked = new Map<string, Tone>([
      ["doc:1.1", "target"],
      ["doc:article-1", "related"]
    ])
    const tones = blockTones(blocks, (key) => marked.get(key) ?? null)
    expect(Object.fromEntries(tones)).toEqual({
      "doc:article-1": "related",
      "doc:1.1": "target",
      "doc:1.1(a)": "target",
      "doc:1.1/wrap-up": "target",
      "doc:1.2": "related"
    })
    const [first] = groupsOf(blocks)
    expect(runsOf(first?.blocks ?? [], tones).map((run) => [run.tone, run.blocks.length])).toEqual([
      ["related", 1],
      ["target", 3],
      ["related", 1]
    ])
    expect(groupsOf(blocks).map((group) => group.key)).toEqual(["doc:article-1", "doc:article-2"])
  })

  it("flows top-level provisions without a heading as one text", () => {
    const flat = [provision("doc:1", 0, 1, { number: "1" }), provision("doc:2", 0, 1), provision("doc:3", 0, 2)]
    expect(groupsOf(flat).map((group) => group.blocks.length)).toEqual([3])
  })

  it("finds a search's words where words start, and cuts a snippet around the first", () => {
    expect(queryWords("the Fence of")).toEqual(["fence"])
    expect(queryWords("of")).toEqual(["of"])
    const text = "Fences and fencing; a defence is not a fence."
    const ranges = wordRanges(text, ["fenc"])
    expect(ranges.map((range) => text.slice(range.start, range.end))).toEqual(["Fences", "fencing", "fence"])
    expect(splitAt("a fence here", [{ start: 2, end: 7 }])).toEqual([
      { text: "a ", isMarked: false },
      { text: "fence", isMarked: true },
      { text: " here", isMarked: false }
    ])
    expect(wordRanges(text, [])).toEqual([])
    const long = `${"Lorem ipsum dolor sit amet. ".repeat(10)}The <td>fence</td> rule. ${"More words here. ".repeat(10)}`
    const snippet = snippetOf(long, ["fence"], 80)
    expect(snippet).toMatch(/^….*fence rule.*…$/)
    expect(snippet).not.toContain("<td>")
    expect(snippetOf("Short text.", ["fence"])).toBe("Short text.")
  })
})

describe("marks on the original", () => {
  const geometry = {
    page: 2,
    width: 8.5,
    height: 11,
    words: [
      { text: "Lawns", start: 0, end: 5, x0: 1, y0: 1, x1: 2, y1: 1.2 },
      { text: "fences", start: 6, end: 12, x0: 2.1, y0: 1, x1: 3, y1: 1.2 }
    ]
  }

  it("draws marked passages over their words, and search matches word by word", () => {
    const tones = blockTones(blocks, (key) => (key === "doc:1.1" ? "target" : null))
    const ranges = markedRanges(blocks, tones, "upload-1")
    expect(ranges.get(2)).toEqual([{ tone: "target", start: 0, end: 4 }])
    const marks = pageMarks(geometry, ranges.get(2) ?? [], ["fence"])
    expect(marks.map((mark) => [mark.tone, mark.x])).toEqual([
      ["target", 1],
      ["match", 2.1]
    ])
  })

  it("starts a block at its first anchor in the upload, or at its page when it has none", () => {
    expect(startOf(blocks[2], "upload-1")).toMatchObject({ page: 2, start: 0, end: 4, hasRange: true })
    expect(startOf(blocks[3], "upload-1")).toMatchObject({ page: 2, hasRange: false })
    expect(startOf(blocks[3], "another")).toBeNull()
    expect(startOf(undefined, "upload-1")).toBeNull()
  })
})
