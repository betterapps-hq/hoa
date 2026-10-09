import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { validateRulebook } from "./validate"
import { rulesFile } from "./zod"

// The committed encoding of the sample Declaration (samples/declaration/rules.json).
const sample = rulesFile.parse(
  JSON.parse(readFileSync(join(import.meta.dirname, "../../samples/declaration/rules.json"), "utf8"))
)

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
