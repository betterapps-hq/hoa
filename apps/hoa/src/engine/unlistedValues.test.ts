import { describe, expect, it } from "vitest"
import type { Fact, FactValue, Finding } from "@/schema/types"
import { entity, exampleRequest, fact, quantity, term } from "@/tests/engineContext"
import { limitsListed, permitsListed, widgetRulesFile as rulesFile } from "@/tests/widgetRulebook"
import { evaluate } from "./evaluate"

// A value outside the rulebook's list (application-review.md, Project types): a value the administrator added to a
// question's choices reaches the engine as itself, matching none of the listed values; a description in the
// homeowner's words ("Other") is uncertain, and the rules that read it go to the committee with the words. Synthetic
// terms and rules, so nothing here leans on a sample.

/** A value of its own, as an added choice reaches the engine: words naming none of the rulebook's values. */
const own = (text: string): FactValue => ({ type: "value", term: null, text })
/** A description in the homeowner's words: uncertain, the words its only reading. */
const described = (property: string, words: string): Fact => ({
  ...fact("widget-1", property, null, "uncertain"),
  stated: words,
  candidates: [{ type: "text", value: words }]
})

function findingOf(ruleKey: string, facts: Fact[]): Finding | undefined {
  const request = exampleRequest()
  return evaluate({
    rulesFile,
    request: { ...request, entities: [...request.entities, entity("widget-1", "widget")], facts },
    evaluatedAt: "2026-02-03T15:01:00Z"
  }).find((finding) => finding.ruleKey === ruleKey && finding.entity === "widget-1")
}

const size = (inches: number) => fact("widget-1", "widget.size", quantity(inches))

describe("a value outside the rulebook's list", () => {
  it("isn't limited by a rule that limits only the listed values", () => {
    const listed = findingOf(limitsListed.key, [
      fact("widget-1", "widget.placement", term("widget-placement.alpha")),
      size(20)
    ])
    expect(listed?.outcome).toBe("not-met")
    // Even with the very words of a listed value's label, a value of its own is never taken for that value.
    for (const text of ["delta", "alpha"]) {
      const added = findingOf(limitsListed.key, [fact("widget-1", "widget.placement", own(text)), size(20)])
      expect(added?.outcome).toBe("not-applicable")
    }
  })

  it("fails a rule that permits only the listed values", () => {
    expect(findingOf(permitsListed.key, [fact("widget-1", "widget.finish", term("widget-finish.two"))])?.outcome).toBe(
      "met"
    )
    // "four" is in the rulebook's set but not among the permitted; an added "five" is in neither, and "one" as an
    // added value's words is still not the rulebook's one.
    for (const reading of [term("widget-finish.four"), own("five"), own("one")]) {
      expect(findingOf(permitsListed.key, [fact("widget-1", "widget.finish", reading)])).toMatchObject({
        outcome: "not-met",
        remedy: "change-detail"
      })
    }
  })

  it("sends a description no rule can test to the committee with the homeowner's words, never passing or failing it", () => {
    const placement = findingOf(limitsListed.key, [described("widget.placement", "Under the eaves"), size(20)])
    expect(placement).toMatchObject({ outcome: "committee", remedy: null })
    expect(placement?.reason).toContain("placement described as “Under the eaves”")
    expect(placement?.inputs).toContainEqual({ entity: "widget-1", property: "widget.placement", state: "uncertain" })
    const finish = findingOf(permitsListed.key, [described("widget.finish", "Brushed, like the railings")])
    expect(finish).toMatchObject({ outcome: "committee", remedy: null })
    expect(finish?.reason).toContain("“Brushed, like the railings”")
    // Met whatever the description means stays met.
    expect(findingOf(limitsListed.key, [described("widget.placement", "Under the eaves"), size(8)])?.outcome).toBe(
      "met"
    )
  })

  it("still asks for information when a detail is unsure or unknown rather than described", () => {
    const unsure: Fact = {
      ...fact("widget-1", "widget.finish", null, "uncertain"),
      candidates: [term("widget-finish.one")]
    }
    expect(findingOf(permitsListed.key, [unsure])?.outcome).toBe("missing-information")
    expect(findingOf(permitsListed.key, [])?.outcome).toBe("missing-information")
    // A description alongside a detail that's simply unknown still needs that detail.
    expect(findingOf(limitsListed.key, [described("widget.placement", "Under the eaves")])?.outcome).toBe(
      "missing-information"
    )
  })
})
