import { describe, expect, it } from "vitest"
import { mergeRulesFiles } from "@/evaluation/review/rulesFile"
import { planFacts } from "@/review/factPlan"
import { fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { bindDefinition, buildDefinition, projectRules, projectSubjects } from "./build"

const rulesFile = mergeRulesFiles(sampleRulesFile(), fenceRulesFile())
const requestType = "architectural-application"
const on = "2026-10-09"

describe("projectSubjects", () => {
  it("lists the things application rules apply to, with no parties, documents or the work itself", () => {
    const subjects = projectSubjects(rulesFile, requestType)
    const keys = subjects.map((subject) => subject.key)
    expect(keys.length).toBeGreaterThan(0)
    expect(keys).not.toContain("work")
    expect(keys).not.toContain("owner")
    for (const subject of subjects) {
      const term = [...rulesFile.terms, ...rulesFile.proposedCore].find((item) => item.key === subject.key)
      expect(term).toMatchObject({ kind: "thing", nature: "object" })
    }
  })
})

describe("buildDefinition", () => {
  const [subject] = projectSubjects(rulesFile, requestType)
  const definition = buildDefinition(rulesFile, requestType, [subject!.key], on)

  it("asks only properties the selected rules test, in a group per subject", () => {
    const tested = new Set(
      planFacts(rulesFile, projectRules(rulesFile, requestType, [subject!.key], on), requestType).properties.map(
        (property) => property.key
      )
    )
    const fields = definition.groups.flatMap((group) => group.fields)
    expect(fields.length).toBeGreaterThan(0)
    expect(fields.every((field) => tested.has(field.property))).toBe(true)
    expect(definition.groups.find((group) => group.subject === subject!.key)?.isRepeatable).toBe(true)
    expect(definition.groups.find((group) => group.subject === "work")?.isRepeatable ?? false).toBe(false)
  })

  it("types each field from the vocabulary: units for quantities, the value set's options for choices", () => {
    const fields = definition.groups.flatMap((group) => group.fields)
    const choices = fields.flatMap((field) => (field.kind === "choice" ? [field.options.length] : []))
    const units = fields.flatMap((field) => (field.kind === "number" && field.unit ? [field.unit.label] : []))
    expect(choices.length).toBeGreaterThan(0)
    expect(choices.every((count) => count > 0)).toBe(true)
    expect(units.length).toBeGreaterThan(0)
    expect(units.every((label) => /^[a-z ]+$/i.test(label))).toBe(true)
  })

  it("lists each document the rules require once, with every rule that requires it", () => {
    const types = definition.documents.map((document) => document.documentType)
    expect(new Set(types).size).toBe(types.length)
    const documentRules = new Set(
      rulesFile.rules.flatMap((rule) => (rule.kind === "norm" && rule.check?.type === "document" ? [rule.key] : []))
    )
    expect(definition.documents.every((document) => document.ruleKeys.every((key) => documentRules.has(key)))).toBe(
      true
    )
  })
})

describe("bindDefinition", () => {
  const [subject] = projectSubjects(rulesFile, requestType)
  const built = buildDefinition(rulesFile, requestType, [subject!.key], on)
  const group = built.groups.find((item) => item.subject === subject!.key)!
  const [first] = group.fields

  it("keeps the administrator's wording on fields the rules ask and drops anything else", () => {
    const edited = {
      ...built,
      groups: [
        {
          ...group,
          fields: [
            { ...first!, label: "Asked plainly", isRequired: true },
            { kind: "text" as const, property: "made-up.property", label: "Invented", help: null, isRequired: false }
          ]
        },
        { ...group, subject: "made-up", fields: [first!] }
      ]
    }
    const bound = bindDefinition(edited, built)
    expect(bound.groups).toHaveLength(1)
    expect(bound.groups[0]!.fields).toEqual([{ ...first!, label: "Asked plainly", isRequired: true }])
    expect(bound.documents).toEqual(built.documents)
  })
})
