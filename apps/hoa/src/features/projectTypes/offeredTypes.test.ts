import invariant from "tiny-invariant"
import { describe, expect, it } from "vitest"
import { mergeRulesFiles } from "@/evaluation/review/rulesFile"
import { buildDefinition, projectSubjects, propertyRules } from "@/projectTypes/build"
import type { ProjectType } from "@/projectTypes/projectType"
import { fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { sampleDeclarationRulesFile } from "@/tests/sampleRulesFile"
import { offerType } from "./offeredTypes"

const rulesFile = mergeRulesFiles(sampleDeclarationRulesFile(), fenceRulesFile())
const requestType = "architectural-application"
const on = "2026-10-09"
const [subject] = projectSubjects(rulesFile, requestType)
invariant(subject, "The sample has a subject.")
const type: ProjectType = {
  id: "type-1",
  organizationId: "hoa",
  label: "Fence",
  description: null,
  status: "active",
  rulebookId: "rb-1",
  createdAt: on,
  updatedAt: on,
  definition: buildDefinition(rulesFile, requestType, [subject.key], on)
}

describe("offerType", () => {
  it("names the rules that read each question, from the published rulebook the type was built with", () => {
    const offered = offerType(type, { id: "rb-1", rulesFile }, on)
    const [property, keys] = Object.entries(propertyRules(rulesFile, requestType, [subject.key], on))[0] ?? []
    invariant(property && keys, "A rule reads one of the subject's properties.")
    expect(offered.reasons.rules[property]).toEqual(
      keys.map((key) => rulesFile.rules.find((rule) => rule.key === key)?.title)
    )
    expect(offered.definition.groups.map((group) => group.subject)).toEqual(
      type.definition.groups.map((group) => group.subject)
    )
  })

  it("offers a type as stored, with no reasons, before the organization publishes a rulebook", () => {
    expect(offerType(type, null, on)).toEqual({ ...type, reasons: { citations: {}, rules: {} } })
  })

  it("keeps the form of a type built against an earlier rulebook as stored", () => {
    expect(offerType(type, { id: "rb-2", rulesFile }, on).definition).toBe(type.definition)
  })
})
