import { describe, expect, it } from "vitest"
import { termDraft } from "@/schema/zod"
import { examples } from "@/tests/engineContext"
import * as D from "./decimal"
import { createEngineVocabulary, toBase } from "./vocabulary"

const greys = [
  {
    key: "composite-color.storm",
    kind: "value",
    set: "composite-color",
    broader: ["composite-color.grey-tones"],
    labels: [{ text: "Storm", role: "preferred" }]
  },
  {
    key: "composite-color.grey-tones",
    kind: "value",
    set: "composite-color",
    broader: ["composite-color.neutral"],
    labels: [{ text: "grey tones", role: "preferred" }]
  },
  {
    key: "composite-color.neutral",
    kind: "value",
    set: "composite-color",
    labels: [{ text: "neutral", role: "preferred" }]
  }
].map((draft) => termDraft.parse(draft))

const vocabulary = createEngineVocabulary([...examples.terms, ...greys])

describe("the engine's vocabulary", () => {
  it("finds the organization's term first, then the core one", () => {
    expect(vocabulary.label("committee")).toBe("Reviewer")
    expect(vocabulary.label("board")).toBe("board")
    expect(vocabulary.property("fence-run.height")?.valueType).toEqual({ type: "quantity", unit: "inch" })
    expect(vocabulary.property("fence-run")).toBeUndefined()
    expect(vocabulary.category("return-fence")?.of).toBe("fence-run")
    expect(vocabulary.category("fence-run")).toBeUndefined()
    expect(vocabulary.requestOf("violation")?.flow).toBe("enforcement")
    expect(vocabulary.requestOf("fence-run")).toBeNull()
  })

  it("resolves categories to their thing, and parties through categories", () => {
    expect(vocabulary.thingOf("return-fence")).toBe("fence-run")
    expect(vocabulary.isKindOf("return-fence", "fence-run")).toBe(true)
    expect(vocabulary.isKindOf("fence-run", "return-fence")).toBe(false)
    expect(vocabulary.isParty("neighbor")).toBe(true)
    expect(vocabulary.isParty("fence-run")).toBe(false)
  })

  it("puts a value under itself and its broader values, however deep, and a party under its categories' parties", () => {
    expect(vocabulary.isUnder("composite-color.storm", "composite-color.storm")).toBe(true)
    expect(vocabulary.isUnder("composite-color.storm", "composite-color.neutral")).toBe(true)
    expect(vocabulary.isUnder("composite-color.neutral", "composite-color.storm")).toBe(false)
    expect(vocabulary.isUnder("neighbor", "owner")).toBe(true)
    expect(vocabulary.isUnder("owner", "neighbor")).toBe(false)
  })

  it("converts units within a dimension by perBase", () => {
    expect(vocabulary.unit("foot")).toEqual({ dimension: "length", perBase: D.exact("304.8") })
    expect(vocabulary.unit("foot")).toBe(vocabulary.unit("foot"))
    expect(vocabulary.unit("fence-run")).toBeUndefined()
    expect(toBase(vocabulary, D.integer(6), "foot")?.value).toEqual(toBase(vocabulary, D.integer(72), "inch")?.value)
    expect(toBase(vocabulary, D.integer(1), "acre")?.value).toEqual(
      toBase(vocabulary, D.integer(43560), "square-foot")?.value
    )
    expect(toBase(vocabulary, D.integer(72), "hour")?.value).toEqual(
      toBase(vocabulary, D.integer(3), "calendar-day")?.value
    )
    expect(toBase(vocabulary, D.integer(20), "percent")?.value).toEqual(D.fraction(1, 5))
    expect(toBase(vocabulary, D.integer(3), "business-day")).toEqual({
      value: D.integer(3),
      dimension: "business-time"
    })
    expect(toBase(vocabulary, D.integer(3), "furlong")).toBeUndefined()
  })

  it("keeps a core unit's conversion when a rulebook refines it", () => {
    const acre = termDraft.parse({
      key: "acre",
      kind: "unit",
      dimension: "area",
      perBase: "6272640",
      labels: [{ text: "ac", role: "preferred" }]
    })
    const refined = createEngineVocabulary([acre])
    expect(refined.unit("acre")).toEqual({ dimension: "area", perBase: D.exact("4046856422.4") })
    expect(refined.label("acre")).toBe("ac")
  })
})
