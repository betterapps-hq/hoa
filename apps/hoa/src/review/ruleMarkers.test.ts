import { describe, expect, it } from "vitest"
import { parseRuleMarkers, renderRuleMarkers, unknownRuleMarkers } from "./ruleMarkers"

const key = "guidelines:5.4.2(i)#colors"

describe("rule markers", () => {
  it("splits text and markers", () => {
    expect(parseRuleMarkers(`Pick a color listed in {{rule:${key}}}.`)).toEqual([
      { type: "text", text: "Pick a color listed in " },
      { type: "rule", ruleKey: key },
      { type: "text", text: "." }
    ])
  })

  it("finds markers naming rules outside the findings", () => {
    const texts = [`See {{rule:${key}}} and {{rule:declaration:9.9#other}}, {{rule:declaration:9.9#other}}.`]
    expect(unknownRuleMarkers(texts, new Set([key]))).toEqual(["declaration:9.9#other"])
    expect(unknownRuleMarkers([`{{rule:${key}}}`], new Set([key]))).toEqual([])
  })

  it("renders each marker", () => {
    expect(renderRuleMarkers(`Use {{rule:${key}}}.`, () => "Composite colors")).toBe("Use Composite colors.")
  })
})
