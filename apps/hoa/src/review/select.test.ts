import { describe, expect, it } from "vitest"
import { fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { selectedRulesFile, selectRules } from "./select"

const request = fenceRequest()
const input = (entityTypes: string[], governingDate = request.governingDate) => ({
  type: request.type,
  governingDate,
  entityTypes,
  lotRef: null
})

describe("selectRules", () => {
  const rulesFile = fenceRulesFile()
  const selected = selectRules(rulesFile, input(request.entities.map((entity) => entity.type)))

  it("keeps the application's rules on its entities, and the rules overriding them", () => {
    expect(selected).toContain("guidelines:5.4.2(i)#colors")
    expect(selected).toContain("guidelines:5.9.1#gate-boards")
    expect(selected).toContain("declaration:4.3(b)/p3#written-response")
    // A discretion rule with a selector and no subject arrives only by overriding a selected rule.
    expect(selected).toContain("declaration:4.5#variance")
    expect(selected).toContain("guidelines:5.2.2#other-styles")
  })

  it("leaves out rules of other request types and subjects the application doesn't have", () => {
    expect(selected).not.toContain("declaration:4.3(a)/p2#board-consent")
    expect(selected).not.toContain("declaration:4.3(b)/p7#diligent-pursuit")
    const withoutGates = selectRules(rulesFile, input(["architectural-application", "lot", "work", "fence-run"]))
    expect(withoutGates).not.toContain("guidelines:5.9.1#gate-boards")
  })

  it("leaves out rules not yet in force on the governing date", () => {
    expect(selectRules(rulesFile, input(["fence-run"], "2020-01-01"))).not.toContain("guidelines:5.4.2(i)#colors")
  })

  it("selects the garage enclosure's rules from the sample", () => {
    const sample = sampleRulesFile()
    const garage = selectRules(
      sample,
      input(["architectural-application", "lot", "community", "work", "space-conversion"])
    )
    expect(garage).toEqual(
      expect.arrayContaining([
        "use-restrictions:a(vii)#replacement-garage-plans",
        "use-restrictions:a(vii)#reviewer-garage-enclosure",
        "use-restrictions:a(vii)#no-conversion",
        "declaration:4.1/p1#approval-required",
        "declaration:4.2(d)#fee-before-review"
      ])
    )
    expect(selectedRulesFile(sample, garage).rules).toHaveLength(garage.length)
  })
})
