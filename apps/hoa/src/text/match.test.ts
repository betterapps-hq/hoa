import { describe, expect, it } from "vitest"
import {
  findLabels,
  fuzzyThreshold,
  levenshtein,
  matchLabel,
  partialRatio,
  ratio,
  similarity,
  tokenSetRatio
} from "./match"

describe("scores", () => {
  it("levenshtein counts insertions, deletions and substitutions", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3)
    expect(levenshtein("", "abc")).toBe(3)
  })

  it("ratio is one minus the normalized insert-and-delete distance", () => {
    expect(ratio("abc", "abc")).toBe(1)
    expect(ratio("", "")).toBe(1)
    expect(ratio("abc", "xyz")).toBe(0)
    expect(ratio("restnctions", "restrictions")).toBeCloseTo(20 / 23)
  })

  it("partial ratio finds the shorter text inside the longer", () => {
    expect(partialRatio("gray", "winchester gray")).toBe(1)
    expect(partialRatio("", "")).toBe(1)
    expect(partialRatio("", "abc")).toBe(0)
  })

  it("token-set ratio ignores word order and repeats", () => {
    expect(tokenSetRatio("gray winchester", "winchester gray gray")).toBe(1)
    expect(tokenSetRatio("fence height", "gate width")).toBeLessThan(0.5)
  })

  it("similarity weighs partial matches down as the lengths diverge", () => {
    expect(similarity("Winchester Gray", "winchester grey")).toBeGreaterThan(0.9)
    expect(similarity("Common Area", "Limited Common Area")).toBeCloseTo(0.9)
    expect(similarity("ARC", "an architectural review committee of the board")).toBeLessThan(0.7)
    expect(similarity("", "x")).toBe(0)
  })
})

describe("matchLabel", () => {
  it("matches exactly after normalizing case, punctuation and quotes", () => {
    expect(matchLabel("Fence-Run", { text: "fence run" })).toEqual({ kind: "exact", score: 1 })
  })

  it("matches the plural, stored or generated", () => {
    expect(matchLabel("gates", { text: "gate" })).toEqual({ kind: "exact", score: 1 })
    expect(matchLabel("people", { text: "person", plural: "people" })).toEqual({ kind: "exact", score: 1 })
  })

  it("matches OCR noise fuzzily, with its score", () => {
    expect(matchLabel("Restnctions", { text: "Restrictions" })).toEqual({ kind: "fuzzy", score: 0.87 })
    expect(matchLabel("Winchester Gray", { text: "Winchester Grey" })).toMatchObject({ kind: "fuzzy" })
  })

  it("never matches a label under four characters fuzzily", () => {
    expect(fuzzyThreshold(3)).toBeNull()
    expect(matchLabel("ARB", { text: "ARC" })).toBeNull()
    expect(matchLabel("arc", { text: "ARC" })).toEqual({ kind: "exact", score: 1 })
  })

  it("rejects labels that only look alike", () => {
    expect(matchLabel("fence", { text: "gate" })).toBeNull()
    expect(fuzzyThreshold(5)).toBe(0.9)
    expect(fuzzyThreshold(12)).toBe(0.85)
  })
})

describe("findLabels", () => {
  const entries = [
    { item: "fence-run", text: "fence run" },
    { item: "restrictions", text: "Use Restrictions" },
    { item: "arc", text: "ARC" },
    { item: "lattice", text: "lattice" }
  ]

  it("finds labels and plurals among the text's words, and OCR noise fuzzily", () => {
    const hits = findLabels("Two fence runs, as the Use Restnctions and the ARC allow.", entries)
    expect(hits).toEqual([
      { item: "fence-run", label: "fence run", found: "fence runs", kind: "exact", score: 1 },
      { item: "restrictions", label: "Use Restrictions", found: "use restnctions", kind: "fuzzy", score: 0.875 },
      { item: "arc", label: "ARC", found: "arc", kind: "exact", score: 1 }
    ])
  })

  it("doesn't match inside a longer word, a changed short word or a short label with an edit", () => {
    expect(findLabels("The ARCHITECT and the latticework", entries)).toEqual([])
    expect(findLabels("Class A Members", [{ item: "b", text: "Class B Members" }])).toEqual([])
    expect(findLabels("a stone well", [{ item: "wall", text: "wall" }])).toEqual([])
  })
})
