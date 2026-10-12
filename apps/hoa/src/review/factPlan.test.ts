import { describe, expect, it } from "vitest"
import { fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { rulebookVocabulary } from "./documentTypes"
import { entityGroups, planFacts } from "./factPlan"
import { selectRules } from "./select"

const rulesFile = fenceRulesFile()
const request = fenceRequest()
const selected = selectRules(rulesFile, {
  type: request.type,
  governingDate: request.governingDate,
  entityTypes: request.entities.map((entity) => entity.type),
  lotRef: null
})
const plan = planFacts(rulesFile, selected, request.type)
const byOwner = (owner: string) => plan.properties.filter((property) => property.owner === owner).map((p) => p.key)

describe("planFacts", () => {
  it("plans every property the fence rules read, per entity type", () => {
    expect(byOwner("fence-run")).toEqual(
      expect.arrayContaining([
        "fence-run.material",
        "fence-run.manufacturer",
        "fence-run.color",
        "fence-run.board-orientation",
        "fence-run.height",
        "fence-run.post-color",
        "fence-run.location",
        "fence-run.boundary-with",
        "fence-run.lattice-height",
        "fence-run.setback-from-front-corner"
      ])
    )
    expect(byOwner("gate")).toEqual(
      expect.arrayContaining(["gate.fence-run", "gate.material", "gate.board-orientation", "gate.height", "gate.color"])
    )
    expect(byOwner("work")).toContain("work.kind")
  })

  it("leaves out the governing date, which code supplies, and lists choices with their values", () => {
    expect(plan.properties.map((property) => property.key)).not.toContain("architectural-application.submitted-on")
    const color = plan.properties.find((property) => property.key === "fence-run.color")
    expect(color?.values?.map((value) => value.key)).toContain("composite-color.river-birch")
    expect(color?.isComplete).toBe(false)
    expect(plan.properties.find((property) => property.key === "fence-run.lattice-height")?.ifUnstated).toBe("absent")
  })

  it("splits the plan into the application's call and one per item type", () => {
    const groups = entityGroups(plan, request.entities, rulebookVocabulary(rulesFile), [
      "architectural-application",
      "lot",
      "community",
      "work"
    ])
    expect(groups.map((group) => [group.id, group.entities])).toEqual([
      ["application", ["request", "lot", "community", "work-1"]],
      ["fence-run", ["run-1", "run-2", "run-3", "run-4"]],
      ["gate", ["gate-1"]]
    ])
  })
})
