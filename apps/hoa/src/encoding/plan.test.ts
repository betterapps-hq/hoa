import { describe, expect, it } from "vitest"
import type { Provision } from "@/schema/types"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { estimateTokens, planUnits } from "./plan"
import { analyzeReferences, citedProvisions } from "./references"

// The sample Declaration's golden provisions, planned with its references and vocabulary.
const file = sampleRulesFile()
const documentKeys = [...new Set(file.provisions.map((provision) => provision.key.split(":")[0] ?? ""))]
const documents = documentKeys.map((key) => ({
  key,
  provisions: file.provisions.filter((provision) => provision.key.startsWith(`${key}:`))
}))
const { references } = analyzeReferences(documents, [
  { key: "declaration", names: ["Declaration"] },
  { key: "use-restrictions", names: ["Use Restrictions"] }
])
const cited = new Map([...references].map(([key, found]) => [key, citedProvisions(found, key)]))
const units = planUnits({ documents, references: cited, vocabulary: file.terms })

const tokensOf = (provisions: readonly Provision[]) =>
  provisions.reduce(
    (sum, provision) =>
      sum +
      estimateTokens([provision.heading, provision.text, provision.intro, provision.wrapUp].filter(Boolean).join("\n")),
    0
  )
const unitOf = (key: string) => units.find((unit) => unit.provisions.some((provision) => provision.key === key))

describe("planUnits on the sample Declaration", () => {
  it("puts every provision in exactly one unit, in document order", () => {
    expect(units.flatMap((unit) => unit.provisions.map((provision) => provision.key))).toEqual(
      documents.flatMap((document) => document.provisions.map((provision) => provision.key))
    )
  })

  it("keeps an article that fits whole, and splits a larger one by section", () => {
    expect(
      unitOf("declaration:article-1")?.provisions.every((provision) =>
        /^declaration:(article-1|1\.)/.test(provision.key)
      )
    ).toBe(true)
    expect(unitOf("declaration:1.3/p5")?.id).toBe("declaration:article-1")
    const article7 = units.filter((unit) => /^declaration:(article-7|7\.)/.test(unit.id))
    expect(article7.length).toBeGreaterThan(1)
    expect(unitOf("declaration:7.4(a)(viii)")).toBe(unitOf("declaration:7.4"))
  })

  it("stays within the token budget", () => {
    for (const unit of units) {
      expect(tokensOf(unit.provisions)).toBeLessThanOrEqual(6000)
    }
  })

  it("gives a split unit its ancestors' headings, intros and wrap-ups", () => {
    const split = units.find((unit) => unit.id.startsWith("declaration:7.") && unit.id !== "declaration:article-7")
    expect(split?.context.map((ancestor) => ancestor.key)).toEqual(["declaration:article-7"])
    expect(split?.context[0]).toMatchObject({ heading: "Association Powers and Responsibilities", intro: null })
  })

  it("brings in the provisions a unit cites, truncated", () => {
    const article1 = unitOf("declaration:article-1")
    expect(article1?.references.map((reference) => reference.key)).toContain("declaration:article-21")
    const small = planUnits({ documents, references: cited, vocabulary: [] }, { referenceTokens: 10 })
    const reference = small.find((unit) => unit.id === "declaration:article-1")?.references[0]
    expect(reference).toMatchObject({ isTruncated: true })
    expect(reference?.text.length).toBe(41)
  })

  it("slices the vocabulary to the terms the unit mentions and their related terms", () => {
    const unit = unitOf("declaration:3.1(c)")
    const keys = unit?.terms.map((term) => term.key) ?? []
    expect(keys).toContain("lot")
    expect(keys).toContain("lease")
    expect(keys).not.toContain("antenna-service")
    expect(unit?.matches.find((match) => match.key === "lot")).toMatchObject({ kind: "exact", score: 1 })
  })

  it("lists the core request types with their data", () => {
    const keys = units[0]?.requestTypes.map((term) => term.key)
    expect(keys).toContain("architectural-application")
    expect(keys).toContain("architectural-application.submitted-on")
    expect(keys).not.toContain("owner")
  })

  it("splits a section larger than the budget into its items, packing neighbours", () => {
    const tight = planUnits({ documents, references: cited, vocabulary: [] }, { maxTokens: 400 })
    expect(tight.length).toBeGreaterThan(units.length)
    for (const unit of tight.filter((item) => item.provisions.length > 1)) {
      expect(tokensOf(unit.provisions)).toBeLessThanOrEqual(400)
    }
  })
})
