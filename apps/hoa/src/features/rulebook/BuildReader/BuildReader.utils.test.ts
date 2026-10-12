import { describe, expect, it } from "vitest"
import type { BuildResult } from "@/rulebook/buildResults"
import { simulatedBuildSeconds } from "@/tests/simulatedBuild"
import { readingDocument, readingResults } from "@/tests/simulatedReading"
import { slotCenter } from "../BuildFindings/BuildFindings.utils"
import { findingCounts } from "../BuildProgress/BuildProgress.utils"
import {
  beatMs,
  beatPlan,
  countsOf,
  nextSpot,
  paceOf,
  readerDocuments,
  readerEvents,
  readerLayout,
  settledScene,
  statementPieces,
  termSpot,
  type ReaderEvent,
  type WordSpot
} from "./BuildReader.utils"

// Maple Hollow's made-up declaration and its build (src/tests/simulatedReading.ts).

const documents = readerDocuments([readingDocument])
const blocks = documents[0]?.blocks ?? []

/** The words a spot marks. */
function wordsAt(spot: WordSpot | null) {
  const block = blocks.find((item) => item.key === spot?.blockKey)
  const text = spot?.part === "intro" && block?.type === "provision" ? block.intro : block?.text
  return spot ? text?.slice(spot.start, spot.end) : undefined
}

const kindOf =
  <K extends ReaderEvent["kind"]>(kind: K) =>
  (event: ReaderEvent): event is Extract<ReaderEvent, { kind: K }> =>
    event.kind === kind

describe("termSpot", () => {
  it("marks a term where its definition defines it, or else where the document first uses it, in either number", () => {
    const lot = termSpot("Lot", documents)
    expect(lot).toMatchObject({ documentKey: "declaration", blockKey: "declaration:article-2/lot", part: "text" })
    expect(wordsAt(lot)).toBe("Lot")
    const customer = termSpot("customer", documents)
    expect(customer?.blockKey).toBe("declaration:3.1")
    expect(wordsAt(customer)).toBe("customers")
    // A lead-in is searched too.
    expect(termSpot("household pet", documents)).toMatchObject({ blockKey: "declaration:3.2", part: "intro" })
    // Whole words: 3.7's "leased" isn't "lease".
    const lease = termSpot("lease", documents)
    expect(lease?.blockKey).toBe("declaration:3.7")
    expect(wordsAt(lease)).toBe("lease")
    expect(termSpot("pergola", documents)).toBeNull()
  })
})

describe("readerEvents", () => {
  it("names each term once, at its place in the declaration", () => {
    const terms = readerEvents(readingResults(560), documents).filter(kindOf("term"))
    // 12 defined, then two groups of vocabulary, the first naming Lot again.
    expect(terms).toHaveLength(12 + 9 + 13)
    expect(terms.filter((term) => term.label === "Lot")).toHaveLength(1)
    expect(terms.every((term) => term.spot !== null)).toBe(true)
  })

  it("gives every provision of a section's answer its verdict, in the answer's order", () => {
    const passages = readerEvents(readingResults(150), documents).filter(kindOf("passage"))
    // Articles 1 to 3: three headings, 1.1 and 1.2, twelve definitions and ten provisions on the use of lots.
    expect(passages).toHaveLength(3 + 2 + 12 + 10)
    expect(passages.slice(0, 4).map((passage) => passage.spot?.blockKey)).toEqual([
      "declaration:article-1",
      "declaration:1.1",
      "declaration:1.2",
      "declaration:article-2"
    ])
    const verdictAt = (label: string) =>
      passages.find((passage) => passage.spot?.blockKey === `declaration:${label}`)?.verdict
    expect(verdictAt("article-1")).toEqual({ kind: "none", reason: "heading" })
    expect(verdictAt("1.2")).toEqual({
      kind: "settings",
      settings: ["Owners answer for their residents and their visitors"]
    })
    expect(verdictAt("article-2/lot")).toEqual({ kind: "definition" })
    expect(verdictAt("3.1")).toEqual({
      kind: "rules",
      rules: [
        { key: "declaration:3.1#single-family", title: "Lots hold one single-family home" },
        { key: "declaration:3.1#home-office", title: "Home offices bring no customers or employees" }
      ]
    })
  })

  it("follows a section's newest answer: a passage given other rules shows again, one with the same rules doesn't", () => {
    const rule = (slug: string) => ({ key: `declaration:3.1#${slug}`, title: slug, provisionKey: "declaration:3.1" })
    const first: BuildResult = {
      id: "first",
      at: "2026-10-11T12:01:00.000Z",
      kind: "outlines",
      unitId: "one",
      rules: [rule("lots")],
      provisions: [
        { key: "declaration:3.1", settings: [], noRule: null },
        { key: "declaration:3.6", settings: [], noRule: "explanatory" }
      ],
      isRerun: false
    }
    const rerun: BuildResult = {
      ...first,
      id: "rerun",
      at: "2026-10-11T12:02:00.000Z",
      rules: [rule("lots"), rule("offices")]
    }
    const before = readerEvents([first], documents).map((event) => event.id)
    const after = readerEvents([first, rerun], documents).map((event) => event.id)
    expect(after).toHaveLength(2)
    expect(after.filter((id) => !before.includes(id))).toEqual([
      "passage:declaration:3.1:declaration:3.1#lots,declaration:3.1#offices"
    ])
  })

  it("shows each rule as each round drafts it, a second draft with the first it replaces", () => {
    const drafts = readerEvents(readingResults(simulatedBuildSeconds), documents).filter(kindOf("draft"))
    expect(drafts).toHaveLength(37 + 2)
    const retries = drafts.filter((draft) => draft.isRetry)
    expect(retries.map((draft) => [draft.title, draft.previous, draft.statement])).toEqual([
      [
        "No overnight street parking",
        "No {{vehicle}} may be parked on the {{street}}.",
        "No {{vehicle}} may be parked on the {{street}} overnight."
      ],
      [
        "Roofs of architectural shingles or standing-seam metal",
        "A {{roof}} must be architectural {{shingle:plural}}.",
        "A {{roof}} must be architectural {{shingle:plural}} or standing-seam metal, in an earth tone."
      ]
    ])
    expect(retries[0]?.spot).toEqual({ documentKey: "declaration", blockKey: "declaration:3.3" })
  })

  it("counts what the build's progress counts, at every point of the build", () => {
    for (const seconds of [15.8, 150, 600, 900, simulatedBuildSeconds]) {
      const results = readingResults(seconds)
      const progress = findingCounts(results)
      expect(countsOf(readerEvents(results, documents))).toEqual({
        terms: progress.terms,
        rules: progress.rulesFound,
        drafted: progress.rulesDrafted
      })
    }
  })

  it("names everything without the documents, with nowhere to show it", () => {
    const events = readerEvents(readingResults(300), [])
    expect(events.every((event) => event.spot === null)).toBe(true)
    expect(countsOf(events)).toEqual(countsOf(readerEvents(readingResults(300), documents)))
  })
})

describe("statementPieces", () => {
  it("leaves a blank for each term and each value of a statement", () => {
    expect(statementPieces("A {{lot}} may keep 3 {{dog:plural}}, one {{fence-run}} and a $25 fee.")).toEqual([
      { type: "text", text: "A " },
      { type: "blank", kind: "term", text: "lot" },
      { type: "text", text: " may keep " },
      { type: "blank", kind: "value", text: "3" },
      { type: "text", text: " " },
      { type: "blank", kind: "term", text: "dogs" },
      { type: "text", text: ", " },
      { type: "blank", kind: "value", text: "one" },
      { type: "text", text: " " },
      { type: "blank", kind: "term", text: "fence run" },
      { type: "text", text: " and a " },
      { type: "blank", kind: "value", text: "$25" },
      { type: "text", text: " fee." }
    ])
    // A statement that opens with a term opens with a capital.
    expect(statementPieces("{{boat:plural}} stay in a {{garage}}.")[0]).toEqual({
      type: "blank",
      kind: "term",
      text: "Boats"
    })
  })
})

describe("readerLayout", () => {
  it("puts the window between the piles, each pile under its count and standing level with the window's foot", () => {
    // 576 × 0.46 is a 265 window; (576 − 265 − 2 × 20) / 2 = 135.5 for each pile.
    const layout = readerLayout(576, { terms: 63, rules: 37 })
    expect(layout).toMatchObject({
      isStacked: false,
      window: { x: 155.5, y: 0, width: 265, height: 252 },
      pitch: 10,
      gridBottom: 252,
      height: 252,
      ceiling: 62
    })
    expect(layout.terms).toEqual({ inner: 135.5, side: -1, columns: 13 })
    expect(layout.rules).toEqual({ inner: 440.5, side: 1, columns: 13 })
    expect(layout.counts.rules.x).toBe(440.5)
    expect(slotCenter(layout, "terms", 0)).toEqual({ x: 130.5, y: 247 })
  })

  it("on a phone, puts the window over the piles, and their counts under them", () => {
    const layout = readerLayout(343, { terms: 63, rules: 37 })
    expect(layout).toMatchObject({
      isStacked: true,
      window: { x: 0, y: 0, width: 343, height: 252 },
      gridBottom: 324,
      height: 368,
      ceiling: 0
    })
    expect(layout.counts.terms.y).toBeGreaterThan(layout.gridBottom)
    expect(layout.rules.inner - layout.terms.inner).toBe(20)
  })

  it("keeps its usual height before it's measured", () => {
    expect(readerLayout(0, { terms: 892, rules: 617 }).height).toBe(252)
  })
})

const term: ReaderEvent = { kind: "term", id: "term:Lot", label: "Lot", spot: null }
const passage: ReaderEvent = {
  kind: "passage",
  id: "passage",
  spot: null,
  verdict: {
    kind: "rules",
    rules: [
      { key: "a", title: "A" },
      { key: "b", title: "B" }
    ]
  }
}
const draft: ReaderEvent = {
  kind: "draft",
  id: "draft",
  title: "Fences no taller than six feet",
  statement: "A {{fence}} may be no taller than 6 feet.",
  isRetry: false,
  previous: null,
  spot: null
}

describe("beatPlan", () => {
  it("gets to a term's passage, marks the term, then sends it to its pile", () => {
    expect(beatPlan(term)).toEqual({
      steps: [
        { at: 0, phase: "found", step: 0, ms: 450 },
        { at: 450, phase: "found", step: 1, ms: 350 },
        { at: 800, phase: "found", step: 1, ms: 700, launch: "terms" }
      ],
      length: 1500
    })
  })

  it("scans a passage, then shows each of its rules as it leaves for the rules, faster when asked", () => {
    const { steps, length } = beatPlan(passage, 2)
    expect(steps.map((step) => [step.at, step.phase, step.step, step.launch])).toEqual([
      [0, "scan", 0, undefined],
      [450, "verdict", 0, "rules"],
      [850, "verdict", 1, "rules"]
    ])
    expect(length).toBe((beatMs.scan + 2 * beatMs.rule) / 2)
    // A passage with no rules has one verdict, and nothing leaves it.
    const none = beatPlan({ ...passage, verdict: { kind: "none", reason: "heading" } })
    expect(none.steps.map((step) => step.phase)).toEqual(["scan", "verdict"])
    expect(none.steps.some((step) => step.launch)).toBe(false)
  })

  it("fills a draft's blanks one at a time, then its rule's dot; a second draft shows the check's problem first", () => {
    const first = beatPlan(draft)
    expect(first.steps.map((step) => [step.phase, step.step])).toEqual([
      ["fill", 0],
      ["fill", 1],
      ["fill", 2],
      ["drafted", 2]
    ])
    expect(first.steps.at(-1)?.fills).toBe(true)
    const again = beatPlan({ ...draft, isRetry: true, previous: "A {{fence}} may be tall." })
    expect(again.steps[0]).toMatchObject({ at: 0, phase: "problem" })
    // Its dot is filled already.
    expect(again.steps.some((step) => step.fills)).toBe(false)
    expect(again.length).toBe(first.length + beatMs.problem)
  })
})

describe("paceOf", () => {
  it("keeps beats at their own pace until a backlog would outrun the budget, then plays up to 8 times faster", () => {
    expect(paceOf(10_000, 45_000)).toBe(1)
    expect(paceOf(90_000, 45_000)).toBe(2)
    expect(paceOf(1_000_000, 45_000)).toBe(8)
  })
})

describe("nextSpot", () => {
  it("drifts through every passage and around again", () => {
    const first = nextSpot(documents, null)
    expect(first).toEqual({ documentKey: "declaration", blockKey: blocks[0]?.key })
    expect(nextSpot(documents, first)).toEqual({ documentKey: "declaration", blockKey: blocks[1]?.key })
    expect(nextSpot(documents, { documentKey: "declaration", blockKey: blocks.at(-1)?.key ?? "" })).toEqual(first)
    expect(nextSpot([], null)).toBeNull()
  })
})

describe("settledScene", () => {
  it("shows the last thing named, at its last moment", () => {
    const events = readerEvents(readingResults(simulatedBuildSeconds), documents)
    expect(settledScene(events)).toMatchObject({
      event: events.at(-1),
      spot: { documentKey: "declaration", blockKey: "declaration:4.5" },
      phase: "drafted"
    })
    expect(settledScene([])).toMatchObject({ event: null, spot: null, phase: "rest" })
  })
})
