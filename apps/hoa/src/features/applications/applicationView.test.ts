import { describe, expect, it } from "vitest"
import { fenceReview } from "@/tests/fenceReview"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { reportRules } from "./applicationView"

describe("reportRules", () => {
  it("gives the selected rules with their statements and citations, the provision's lead-ins included", () => {
    const rulesFile = sampleRulesFile()
    const rules = reportRules(rulesFile, ["declaration:4.3(b)/p2#harmony", "missing#rule"])
    expect(rules.map((rule) => rule.key)).toEqual(["declaration:4.3(b)/p2#harmony"])
    const [rule] = rules
    expect(rule?.statement).toContain("{{")
    expect(rule?.citations[0]).toMatchObject({
      provisionKey: "declaration:4.3(b)/p2",
      label: "Declaration 4.3(b), paragraph 2"
    })
    expect(rule?.citations[0]?.text).toMatch(/harmony of external design/)
  })
})

describe("reviewTerms", () => {
  it("gives the terms the review names and the terms their descriptions name", () => {
    const { terms } = fenceReview()
    const keys = new Set(terms.map((term) => term.key))
    // A statement's term, an entity's type, a fact's property and value, and the property's value set.
    expect(keys).toContain("fence-run")
    expect(keys).toContain("fence-run.color")
    expect(keys).toContain("composite-color.river-birch")
    expect(keys).toContain("composite-color")
    expect(keys.has("vehicle")).toBe(false)
  })
})
