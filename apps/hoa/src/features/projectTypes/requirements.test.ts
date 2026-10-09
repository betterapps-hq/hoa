import { describe, expect, it } from "vitest"
import { mergeRulesFiles } from "@/evaluation/review/rulesFile"
import { projectRules, projectSubjects } from "@/projectTypes/build"
import { fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { projectRequirements, requirementGroups } from "./requirements"

const rulesFile = mergeRulesFiles(sampleRulesFile(), fenceRulesFile())
const requestType = "architectural-application"
const on = "2026-10-09"

describe("projectRequirements", () => {
  const subjects = projectSubjects(rulesFile, requestType).map((subject) => subject.key)
  const groups = projectRequirements(rulesFile, requestType, subjects, on)

  it("lists every rule a review of the project selects, once, in plain groups", () => {
    const listed = groups.flatMap((group) => group.rules.map((rule) => rule.key))
    expect(listed.toSorted()).toEqual(projectRules(rulesFile, requestType, subjects, on).toSorted())
    expect(new Set(listed).size).toBe(listed.length)
    const order = requirementGroups.map((group) => group.id)
    expect(groups.map((group) => order.indexOf(group.id))).toEqual(
      groups.map((group) => order.indexOf(group.id)).toSorted((a, b) => a - b)
    )
  })

  it("puts document checks under documents and shows statements in the organization's words", () => {
    const documents = groups.find((group) => group.id === "documents")
    const keys = new Set(documents?.rules.map((rule) => rule.key))
    const checks = rulesFile.rules
      .filter((rule) => keys.has(rule.key))
      .map((rule) => (rule.kind === "norm" ? rule.check?.type : rule.kind))
    expect(checks.length).toBeGreaterThan(0)
    expect(new Set(checks)).toEqual(new Set(["document"]))
    expect(groups.flatMap((group) => group.rules).every((rule) => !rule.statement.includes("{{"))).toBe(true)
    expect(groups.flatMap((group) => group.rules).every((rule) => rule.citations.length > 0)).toBe(true)
  })
})
