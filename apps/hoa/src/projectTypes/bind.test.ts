import { describe, expect, it } from "vitest"
import { bindDefinition } from "./bind"
import type { ProjectField, ProjectTypeDefinition } from "./projectType"

// A question's citations are what its answer is checked against (application-review.md, Project types), over a
// synthetic form: the details code would ask about a widget, each citing the passages of the rules that test it.

const base = { help: null, example: null, isRequired: false, answeredBy: "applicant" as const }
const length = {
  kind: "number" as const,
  unit: { key: "inch", label: "inches" },
  dimension: "length",
  units: [{ unit: "inch", labels: ["inch"], perBase: "1" }]
}
const rule = (property: string, label: string, citations: string[], answer: Partial<ProjectField>): ProjectField =>
  ({ ...base, property, binding: property, label, citations, ...answer }) as ProjectField
const size = rule("widget.size", "What is the widget's size?", ["doc:1"], length)
const depth = rule("widget.depth", "What is the widget's depth?", ["doc:1"], length)
const placement = rule("widget.placement", "What is the widget's placement?", ["doc:2"], {
  kind: "choice",
  options: [
    { value: "widget-placement.alpha", label: "alpha", isAdded: false },
    { value: "widget-placement.beta", label: "beta", isAdded: false }
  ],
  allowsOther: false
})
const lit = rule("widget.lit", "Is the widget lit?", ["doc:3"], { kind: "yes-no" })
const group = { subject: "widget", label: "Widgets", itemLabel: "Widget", help: null, isRepeatable: true }
const built: ProjectTypeDefinition = {
  subjects: ["widget"],
  groups: [{ ...group, fields: [size, depth, placement, lit] }],
  documents: [],
  formDocuments: [],
  unasked: []
}

const own = (label: string, citations: string[], answer: Partial<ProjectField>): ProjectField =>
  ({ ...base, property: "custom.question", binding: null, label, citations, ...answer }) as ProjectField
const formOf = (...fields: ProjectField[]): ProjectTypeDefinition => ({
  ...built,
  groups: [{ ...group, fields }]
})
const bound = (...fields: ProjectField[]) => bindDefinition(formOf(...fields), built).groups[0]?.fields ?? []

describe("bindDefinition, by citations", () => {
  it("binds a question to the detail its citations' rules test when its answer type can give it", () => {
    const [question] = bound(own("Does it light up at night?", ["doc:3"], { kind: "yes-no" }))
    expect(question).toMatchObject({ binding: "widget.lit", label: "Does it light up at night?", citations: ["doc:3"] })
    // A citation whose rules test nothing this answer type gives leaves it the administrator's own.
    expect(bound(own("Does it light up at night?", ["doc:1"], { kind: "yes-no" }))[0]).toMatchObject({
      binding: null,
      property: "custom.question"
    })
  })

  it("binds a choice through the rulebook's values it names, keeping the rest as its own", () => {
    const [question] = bound(
      own("Where does it go?", ["doc:2"], {
        kind: "choice",
        options: [
          { value: "alpha", label: "Alpha", isAdded: false },
          { value: "gamma", label: "Gamma", isAdded: false }
        ],
        allowsOther: true
      })
    )
    expect(question).toMatchObject({
      binding: "widget.placement",
      options: [
        { value: "widget-placement.alpha", label: "alpha", isAdded: false },
        { value: "gamma", label: "Gamma", isAdded: true }
      ],
      allowsOther: true
    })
    const none = own("Where does it go?", ["doc:2"], {
      kind: "choice",
      options: [{ value: "gamma", label: "Gamma", isAdded: false }],
      allowsOther: false
    })
    expect(bound(none)[0]?.binding).toBeNull()
  })

  it("keeps a bound question asked once for every item, as the administrator set it", () => {
    expect(bound({ ...placement, isShared: true }, { ...lit, label: "Lit", isShared: false })).toMatchObject([
      { binding: "widget.placement", isShared: true },
      { binding: "widget.lit", isShared: false }
    ])
  })

  it("picks the detail closest to the question's wording when several fit, and never one another question answers", () => {
    const question = own("How deep is it?", ["doc:1"], { ...length, label: "How much depth does it have?" })
    expect(bound(question)[0]?.binding).toBe("widget.depth")
    expect(bound(own("How big is it?", ["doc:1"], length))[0]?.binding).toBe("widget.size")
    // With the depth asked already, the closest free detail is taken.
    expect(bound(depth, question).map((field) => field.binding)).toEqual(["widget.depth", "widget.size"])
  })

  it("unbinds a question when its last justifying citation is removed, and binds it again when it's back", () => {
    const [unbound] = bound({ ...lit, citations: [] })
    expect(unbound).toMatchObject({ binding: null, property: "widget.lit", kind: "yes-no" })
    expect(bound({ ...lit, citations: ["doc:9"] })[0]?.binding).toBeNull()
    expect(bound({ ...unbound!, citations: ["doc:3"] })[0]?.binding).toBe("widget.lit")
    // The rules' own citations (null) keep it bound.
    expect(bound({ ...lit, citations: null })[0]?.binding).toBe("widget.lit")
  })

  it("re-evaluates a question whose answer type changed", () => {
    const asText = { ...base, property: "widget.lit", binding: null, label: "Is it lit?", citations: ["doc:3"] }
    expect(bound({ ...asText, kind: "text" })[0]?.binding).toBeNull()
    expect(bound({ ...asText, kind: "yes-no" })[0]?.binding).toBe("widget.lit")
  })
})

describe("bindDefinition, documents", () => {
  it("keeps a rule document's template, as the administrator attached it", () => {
    const plan = {
      documentType: "plan",
      label: "Plan",
      mustShow: ["the widget"],
      ruleKeys: ["widget-plan"],
      isRequired: true,
      citations: [],
      accepts: null
    }
    const template = {
      id: "00000000-0000-4000-8000-000000000001",
      fileName: "plan.docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: 10
    }
    const rebound = bindDefinition(
      { ...built, documents: [{ ...plan, label: "Widget plan", template }] },
      { ...built, documents: [plan] }
    )
    expect(rebound.documents).toEqual([{ ...plan, label: "Widget plan", template }])
  })
})
