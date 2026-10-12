import { describe, expect, it } from "vitest"
import { sampleDeclarationRulesFile, sampleRulesFile } from "@/tests/sampleRulesFile"
import { validateRulebook } from "./validate"

// The committed golden encoding of the sample organization's documents (samples/declaration/rules.json).
const sample = sampleRulesFile()

describe("the sample rules file", () => {
  it("validates with no issues", () => {
    expect(validateRulebook(sample)).toEqual([])
  })

  it("encodes the Declaration, its Use Restrictions and the Design Guidelines", () => {
    const encoded = new Set(sample.provisions.map((provision) => provision.key.slice(0, provision.key.indexOf(":"))))
    expect([...encoded]).toEqual(["declaration", "use-restrictions", "guidelines"])
    expect(sample.documents.find((document) => document.key === "guidelines")?.edition).not.toBeNull()
  })

  it("reports a broken reference", () => {
    const broken = structuredClone(sample)
    const [first] = broken.rules
    if (first) {
      first.appliesTo = "residense"
    }
    const issues = validateRulebook(broken)
    expect(issues).toEqual([
      { code: "undefined-term", message: "residense isn't a term", recordKey: first?.key, path: ["appliesTo"] }
    ])
  })
})

describe("the sample Declaration without the guidelines", () => {
  const declaration = sampleDeclarationRulesFile()

  it("validates with no issues, the guidelines named but not uploaded", () => {
    expect(validateRulebook(declaration)).toEqual([])
    expect(declaration.documents.find((document) => document.key === "guidelines")?.edition).toBeNull()
  })

  it("keeps no record of the guidelines' encoding", () => {
    const text = JSON.stringify({ ...declaration, documents: [] })
    expect(text).not.toContain('"guidelines:')
    expect(declaration.terms.map((term) => term.key)).not.toContain("fence-run")
    expect(declaration.rules.length).toBe(sample.rules.filter((rule) => !rule.key.startsWith("guidelines:")).length)
  })
})
