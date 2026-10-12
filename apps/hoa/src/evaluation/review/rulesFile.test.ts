import { describe, expect, it } from "vitest"
import { fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { sampleDeclarationRulesFile } from "@/tests/sampleRulesFile"
import { mergeRulesFiles } from "./rulesFile"

describe("mergeRulesFiles", () => {
  it("adds the fence rules to the sample Declaration, and the merge validates", () => {
    const sample = sampleDeclarationRulesFile()
    const merged = mergeRulesFiles(sample, fenceRulesFile())
    const keys = merged.rules.map((rule) => rule.key)
    expect(keys).toContain("guidelines:5.4.2(i)#colors")
    expect(keys).toContain("use-restrictions:a(vii)#no-conversion")
    expect(new Set(keys).size).toBe(keys.length)
    expect(merged.rules.length).toBeGreaterThan(sample.rules.length)
    expect(merged.documents.find((document) => document.key === "guidelines")?.edition).not.toBeNull()
  })
})
