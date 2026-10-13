import { describe, expect, it } from "vitest"
import { fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { ruleChangesSince } from "./ruleChanges"
import { selectRules } from "./select"

// A synthetic newer rulebook made from the fence fixture: one rule the review applied reworded, one dropped, and one
// the request now meets added.

const request = fenceRequest()
const before = fenceRulesFile()
const on = request.governingDate
const applied = selectRules(before, {
  type: request.type,
  governingDate: on,
  entityTypes: request.entities.map((entity) => entity.type),
  lotRef: null
})
const review = { selected: applied, request }

describe("ruleChangesSince", () => {
  it("finds nothing when the newer rulebook applies the same rules, word for word", async () => {
    expect(await ruleChangesSince(review, before, fenceRulesFile(), { cited: [], on })).toEqual([])
  })

  it("names the rules the newer rulebook added, changed or no longer applies to the request", async () => {
    const reworded = "guidelines:5.4.2(i)#colors"
    const dropped = "guidelines:5.9.1#gate-boards"
    const after = {
      ...before,
      rules: before.rules
        .filter((rule) => rule.key !== dropped)
        .map((rule) =>
          rule.key === reworded ? { ...rule, statement: `${rule.statement} Stains count as colors.` } : rule
        )
    }
    const changes = await ruleChangesSince(review, before, after, { cited: [], on })
    expect(changes.filter((item) => item.change === "changed").map((item) => item.key)).toEqual([reworded])
    expect(changes.filter((item) => item.change === "removed").map((item) => item.key)).toEqual([dropped])
    expect(changes.filter((item) => item.change === "added")).toEqual([])
  })

  it("counts a rule the request now meets that the review didn't apply", async () => {
    const added = applied[0]!
    const changes = await ruleChangesSince({ ...review, selected: applied.slice(1) }, before, before, {
      cited: [],
      on
    })
    expect(changes).toEqual([
      { key: added, title: before.rules.find((rule) => rule.key === added)!.title, change: "added" }
    ])
  })
})
