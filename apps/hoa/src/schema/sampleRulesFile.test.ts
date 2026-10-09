import { describe, expect, it } from "vitest"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { validateRulebook } from "./validate"

// The committed encoding of the sample Declaration (samples/declaration/rules.json).
const sample = sampleRulesFile()

describe("the sample Declaration's rules file", () => {
  it("validates with no issues", () => {
    expect(validateRulebook(sample)).toEqual([])
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
