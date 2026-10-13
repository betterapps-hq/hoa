import { describe, expect, it } from "vitest"
import { mergeRulesFiles } from "@/evaluation/review/rulesFile"
import { fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { sampleDeclarationRulesFile } from "@/tests/sampleRulesFile"
import { buildDefinition, projectSubjects } from "./build"
import { checkSuggestions, rulebookForPrompt, type SuggestionAnswer } from "./suggest"

const rulesFile = mergeRulesFiles(sampleDeclarationRulesFile(), fenceRulesFile())
const requestType = "architectural-application"
const on = "2026-10-09"
const [subject] = projectSubjects(rulesFile, requestType)
const built = buildDefinition(rulesFile, requestType, [subject!.key], on)
const field = built.groups.find((group) => group.subject === subject!.key)!.fields[0]!
const ruleKey = rulesFile.rules[0]!.key

const suggestion = (overrides: Partial<SuggestionAnswer["suggestions"][number]> = {}) => ({
  label: "A project",
  description: "What it covers.",
  subjects: [subject!.key],
  fields: [
    {
      subject: subject!.key,
      property: field.property,
      label: "Asked plainly",
      help: null,
      isRequired: true,
      isShared: false
    }
  ],
  documents: [],
  basis: [ruleKey],
  ...overrides
})

describe("checkSuggestions", () => {
  it("keeps fields the rules test, with the model's wording, and every document the rules require", () => {
    const [checked] = checkSuggestions({ suggestions: [suggestion()] }, { rulesFile, requestType, on, existing: [] })
    expect(checked?.definition.groups.flatMap((group) => group.fields)).toEqual([
      { ...field, label: "Asked plainly", isRequired: true }
    ])
    expect(checked?.definition.documents).toEqual(built.documents)
  })

  it("asks once for every item what the model says they all share", () => {
    const fields = [
      { subject: subject!.key, property: field.property, label: "Asked", help: null, isRequired: true, isShared: true }
    ]
    const [checked] = checkSuggestions(
      { suggestions: [suggestion({ fields })] },
      { rulesFile, requestType, on, existing: [] }
    )
    expect(checked?.definition.groups.flatMap((group) => group.fields)).toEqual([
      { ...field, label: "Asked", isRequired: true, isShared: true }
    ])
  })

  it("takes a field named without its subject's prefix, as models often write it", () => {
    const short = field.property.slice(subject!.key.length + 1)
    const fields = [
      { subject: subject!.key, property: short, label: "Asked plainly", help: null, isRequired: true, isShared: false }
    ]
    const [checked] = checkSuggestions(
      { suggestions: [suggestion({ fields })] },
      { rulesFile, requestType, on, existing: [] }
    )
    expect(checked?.definition.groups.flatMap((group) => group.fields)).toEqual([
      { ...field, label: "Asked plainly", isRequired: true }
    ])
  })

  it("drops subjects, fields and rules the rulebook doesn't have, and suggestions that bind to nothing", () => {
    const answer = {
      suggestions: [
        suggestion({
          subjects: [subject!.key, "made-up"],
          fields: [
            {
              subject: "made-up",
              property: "made-up.size",
              label: "Size",
              help: null,
              isRequired: true,
              isShared: false
            }
          ]
        }),
        suggestion({ label: "Unfounded", basis: ["no-such-rule"] })
      ]
    }
    const checked = checkSuggestions(answer, { rulesFile, requestType, on, existing: [] })
    expect(checked.map((item) => item.label)).toEqual(["A project"])
    expect(checked[0]!.definition.subjects).toEqual([subject!.key])
    // No field it named binds, so the subjects' full form stands in.
    expect(checked[0]!.definition.groups).toEqual(built.groups)
  })

  it("leaves out a suggestion the organization already has", () => {
    const checked = checkSuggestions(
      { suggestions: [suggestion({ label: "  a project " })] },
      { rulesFile, requestType, on, existing: [{ label: "A Project" }] }
    )
    expect(checked).toEqual([])
  })
})

describe("rulebookForPrompt", () => {
  it("lists the subjects with their rules and details, the kinds of work, documents and project-wide rules", () => {
    const parsed = JSON.parse(rulebookForPrompt(rulesFile, requestType, on))
    expect(Object.keys(parsed)).toEqual(["subjects", "workKinds", "documents", "projectRules"])
    expect(parsed.subjects[0].key).toBe("work")
    expect(parsed.subjects.slice(1).map((item: { key: string }) => item.key)).toEqual(
      projectSubjects(rulesFile, requestType).map((item) => item.key)
    )
  })
})
