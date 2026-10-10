import invariant from "tiny-invariant"
import { describe, expect, it } from "vitest"
import { mergeRulesFiles } from "@/evaluation/review/rulesFile"
import { planFacts } from "@/review/factPlan"
import { fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { bindDefinition } from "./bind"
import { buildDefinition, projectRules, projectSubjects, propertyRules } from "./build"

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

  it("never asks to upload what the application form provides, and says who must sign an upload", () => {
    const provided = (built: typeof definition) =>
      built.formDocuments.map((document) => [document.documentType, document.ruleKeys])
    expect(provided(definition)).toEqual([
      ["application-form", ["guidelines:3.1.5#application-form"]],
      ["project-description", ["guidelines:3.1.5#project-description"]]
    ])
    // The form collects no signatures, so a document that must be signed is still uploaded.
    const signed = definition.documents.find((document) => document.documentType === "application-form")
    expect(signed?.ruleKeys).toEqual(["guidelines:3.1.5#owner-signatures"])
    expect(signed?.label).toMatch(/ signed by every /)
    expect(definition.documents.map((document) => document.documentType)).not.toContain("project-description")
  })

  it("finds what the form provides through the vocabulary's refinements, not by label", () => {
    const narrative = rulesFile.terms.find((term) => term.key === "plot-plan")
    const asked = (document: string) =>
      rulesFile.rules.map((rule) =>
        rule.key === "guidelines:3.1.5#project-description" && rule.kind === "norm" && rule.check?.type === "document"
          ? { ...rule, check: { ...rule.check, document } }
          : rule
      )
    const category = {
      ...narrative!,
      key: "narrative",
      kind: "category" as const,
      of: "project-description",
      criteria: { type: "text" as const, text: "the project in the owner's words" },
      labels: narrative!.labels.map((label) => ({ ...label, text: "narrative" }))
    }
    const lookalike = {
      ...category,
      key: "statement",
      of: "plans",
      labels: [{ ...category.labels[0]!, text: "project description" }]
    }
    const refined = { ...rulesFile, terms: [...rulesFile.terms, category, lookalike] }
    const built = (document: string) =>
      buildDefinition({ ...refined, rules: asked(document) }, requestType, [subject!.key], on)
    expect(built("narrative").formDocuments.map((document) => document.documentType)).toContain("narrative")
    expect(built("statement").formDocuments.map((document) => document.documentType)).not.toContain("statement")
    expect(built("statement").documents.map((document) => document.documentType)).toContain("statement")
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
            {
              kind: "text" as const,
              property: "made-up.property",
              binding: "made-up.property",
              label: "Invented",
              help: null,
              example: null,
              isRequired: false,
              answeredBy: "applicant" as const,
              citations: null
            }
          ]
        },
        { ...group, subject: "made-up", fields: [first!] }
      ]
    }
    const bound = bindDefinition(edited, built)
    expect(bound.groups).toHaveLength(1)
    expect(bound.groups[0]!.fields).toEqual([{ ...first!, label: "Asked plainly", isRequired: true }])
    expect(bound.documents).toEqual(built.documents)
    expect(bound.formDocuments).toEqual(built.formDocuments)
  })

  it("keeps the administrator's own questions as written, in any section, and their citations", () => {
    const own = {
      kind: "yes-no" as const,
      property: "custom.permit",
      binding: null,
      label: "Do you have a permit?",
      help: null,
      example: null,
      isRequired: true,
      answeredBy: "applicant" as const,
      citations: ["nowhere:1"]
    }
    const edited = {
      ...built,
      groups: [
        { ...group, fields: [own, { ...first!, citations: null }] },
        {
          subject: "work",
          label: "The project",
          itemLabel: "The project",
          help: null,
          isRepeatable: false,
          fields: [own]
        }
      ]
    }
    const bound = bindDefinition(edited, built)
    expect(bound.groups.map((item) => item.fields[0])).toEqual([own, own])
    // A bound question without citations of its own cites its rules'.
    expect(bound.groups[0]!.fields[1]!.citations).toEqual(first!.citations)
    expect(first!.citations?.length).toBeGreaterThan(0)
  })

  it("keeps the administrator's own document requirements, and drops a rule document the rules no longer require", () => {
    const own = {
      documentType: "custom.license",
      label: "License",
      mustShow: [],
      ruleKeys: [],
      isRequired: false,
      citations: [],
      accepts: ["pdf" as const]
    }
    const gone = { ...own, documentType: "made-up-document", ruleKeys: ["r-gone"] }
    const bound = bindDefinition({ ...built, documents: [own, gone, ...built.documents] }, built)
    expect(bound.documents[0]).toEqual(own)
    expect(bound.documents.map((document) => document.documentType)).not.toContain("made-up-document")
  })

  it("keeps every question the form doesn't ask aside, with the administrator's wording", () => {
    const [, second] = group.fields
    const edited = {
      ...built,
      groups: [{ ...group, fields: [first!] }],
      unasked: [{ subject: group.subject, field: { ...second!, label: "Kept wording" } }]
    }
    const bound = bindDefinition(edited, built)
    const total = built.groups.reduce((sum, item) => sum + item.fields.length, 0) + built.unasked.length
    expect(bound.unasked).toHaveLength(total - 1)
    expect(bound.unasked.find((item) => item.field.property === second!.property)?.field.label).toBe("Kept wording")
  })

  it("keeps the administrator's order, choices to offer and documents, required or not", () => {
    const choice = built.groups
      .flatMap((item) => item.fields)
      .find((field) => field.kind === "choice" && field.options.length > 1)
    const choiceGroup = built.groups.find((item) => item.fields.includes(choice!))!
    const offered = choice?.kind === "choice" ? [choice.options[1]!] : []
    const reversed = [...built.documents].reverse().map((document, index) => ({ ...document, isRequired: index === 0 }))
    const edited = {
      ...built,
      groups: [
        {
          ...choiceGroup,
          fields: [
            { ...choice!, options: offered },
            ...choiceGroup.fields.filter((field) => field !== choice).reverse()
          ]
        }
      ],
      documents: reversed.slice(0, -1)
    }
    const bound = bindDefinition(edited, built)
    expect(bound.groups[0]!.fields.map((field) => field.property)).toEqual(
      edited.groups[0]!.fields.map((field) => field.property)
    )
    expect(bound.groups[0]!.fields[0]).toMatchObject({ options: offered })
    expect(bound.documents.map((document) => [document.documentType, document.isRequired])).toEqual(
      reversed.slice(0, -1).map((document) => [document.documentType, document.isRequired])
    )
  })

  it("keeps a choice's added values, their order among the rulebook's, and whether Other is offered", () => {
    const choice = built.groups
      .flatMap((item) => item.fields)
      .find((field) => field.kind === "choice" && field.options.length > 1)
    invariant(choice?.kind === "choice", "a choice question")
    const choiceGroup = built.groups.find((item) => item.fields.includes(choice))!
    const [firstValue, secondValue] = choice.options
    const added = { value: "added-value", label: "Added value", isAdded: true }
    const gone = { value: "no-longer-listed", label: "Gone", isAdded: false }
    const edited = {
      ...built,
      groups: [
        {
          ...choiceGroup,
          fields: [{ ...choice, options: [secondValue!, added, gone, firstValue!], allowsOther: !choice.allowsOther }]
        }
      ]
    }
    const bound = bindDefinition(edited, built).groups[0]!.fields[0]
    expect(bound).toMatchObject({ options: [secondValue, added, firstValue], allowsOther: !choice.allowsOther })
    // Built from the rules, a choice offers the rulebook's values only.
    expect(choice.options.every((option) => !option.isAdded)).toBe(true)
  })

  it("reads a label that's only the detail's name as code's question", () => {
    const named = { ...first!, label: "Placeholder" }
    const plain = bindDefinition({ ...built, groups: [{ ...group, fields: [named] }] }, built)
    expect(plain.groups[0]!.fields[0]!.label).toBe("Placeholder")
    // Code's question for a noun names it at the end: "What is the fence run's height?" from "height".
    expect(first!.label).toMatch(/^What is the .*?'s? (.*)\?$/)
    const bare = first!.label.replace(/^What is the .*?'s? (.*)\?$/, "$1")
    const asName = bindDefinition({ ...built, groups: [{ ...group, fields: [{ ...first!, label: bare }] }] }, built)
    expect(asName.groups[0]!.fields[0]!.label).toBe(first!.label)
  })
})

describe("who answers a question", () => {
  it("asks applicants what a rule checks at application, and keeps aside what only exemptions or deadlines read", () => {
    const subjects = projectSubjects(rulesFile, requestType).map((subject) => subject.key)
    const built = buildDefinition(rulesFile, requestType, subjects, on)
    const byProperty = propertyRules(rulesFile, requestType, subjects, on)
    const rules = new Map(rulesFile.rules.map((rule) => [rule.key, rule]))
    const checksAtApplication = (property: string) =>
      (byProperty[property] ?? []).some((key) => {
        const rule = rules.get(key)
        return rule?.kind === "norm" && rule.modality !== "permission" && rule.check?.type !== "deadline"
      })
    const asked = built.groups.flatMap((group) => group.fields)
    expect(asked.every((field) => field.answeredBy === "applicant" && checksAtApplication(field.property))).toBe(true)
    expect(built.unasked.length).toBeGreaterThan(0)
    // A prohibition with no check is decided by its condition, so what the condition reads is asked.
    expect(asked.map((field) => field.property)).toContain("gate.new-opening")
    expect(
      built.unasked.every(
        (item) => item.field.answeredBy === "association" && !checksAtApplication(item.field.property)
      )
    ).toBe(true)
  })
})

describe("propertyRules", () => {
  it("names the rules that read each question's property", () => {
    const [subject] = projectSubjects(rulesFile, requestType)
    const built = buildDefinition(rulesFile, requestType, [subject!.key], on)
    const byProperty = propertyRules(rulesFile, requestType, [subject!.key], on)
    const selected = new Set(projectRules(rulesFile, requestType, [subject!.key], on))
    for (const field of built.groups.flatMap((group) => group.fields)) {
      expect(byProperty[field.property]?.length ?? 0).toBeGreaterThan(0)
      expect(byProperty[field.property]!.every((key) => selected.has(key))).toBe(true)
    }
  })

  it("lets an amount be written in the other units of its dimension", () => {
    const [subject] = projectSubjects(rulesFile, requestType)
    const built = buildDefinition(rulesFile, requestType, [subject!.key], on)
    const amounts = built.groups
      .flatMap((group) => group.fields)
      .filter((field) => field.kind === "number" && field.unit)
    expect(amounts.length).toBeGreaterThan(0)
    for (const field of amounts) {
      expect(field.kind === "number" && field.units[0]?.unit).toBe(field.kind === "number" ? field.unit?.key : null)
    }
  })
})
