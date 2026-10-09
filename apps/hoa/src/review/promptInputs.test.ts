import { describe, expect, it } from "vitest"
import { fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { rulebookVocabulary } from "./documentTypes"
import { entityGroups, planFacts } from "./factPlan"
import { entitiesForPrompt } from "./promptInputs"
import { selectRules } from "./select"

const rulesFile = fenceRulesFile()
const request = fenceRequest()
const vocabulary = rulebookVocabulary(rulesFile)
const selected = selectRules(rulesFile, {
  type: request.type,
  governingDate: request.governingDate,
  entityTypes: request.entities.map((entity) => entity.type),
  lotRef: null
})
const plan = planFacts(rulesFile, selected, request.type)
const groups = entityGroups(plan, request.entities, vocabulary, [request.type, "lot", "community", "work"])

function shownFor(entityId: string): unknown {
  const group = groups.find((item) => item.entities.includes(entityId))
  if (!group) {
    throw new Error(`No group holds ${entityId}.`)
  }
  return JSON.parse(entitiesForPrompt(group, plan, request.entities, vocabulary))
}

describe("entitiesForPrompt", () => {
  it("lists the group's entities, then the ones its references can point to, only to refer to", () => {
    expect(shownFor("gate-1")).toEqual([
      expect.objectContaining({ id: "gate-1" }),
      ...["run-1", "run-2", "run-3", "run-4"].map((id) => expect.objectContaining({ id, onlyToReferTo: true }))
    ])
  })

  it("adds nothing for a group without references", () => {
    expect(shownFor("run-1")).toEqual(["run-1", "run-2", "run-3", "run-4"].map((id) => expect.objectContaining({ id })))
  })
})
