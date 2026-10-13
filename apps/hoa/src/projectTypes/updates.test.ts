import { describe, expect, it } from "vitest"
import { allQuestions } from "./definition"
import type { ProjectDocument, ProjectField, ProjectTypeDefinition } from "./projectType"
import { applyChanges, carriedForward, rulebookChanges } from "./updates"

// What a newer rulebook changes in a project type's form, and the form after a review (application-review.md,
// Project types, Out of date), over synthetic forms: what an earlier rulebook built, what a newer one builds, and the
// administrator's edited form.

const base = { help: null, example: null, isRequired: false, answeredBy: "applicant" as const }
const choice = (
  property: string,
  label: string,
  values: string[],
  citations: string[]
): Extract<ProjectField, { kind: "choice" }> => ({
  ...base,
  kind: "choice",
  property,
  binding: property,
  label,
  citations,
  options: values.map((value) => ({ value: `${property}.${value}`, label: value, isAdded: false })),
  allowsOther: false
})
const yesNo = (property: string, label: string, citations: string[]): ProjectField => ({
  ...base,
  kind: "yes-no",
  property,
  binding: property,
  label,
  citations
})
const document = (documentType: string, mustShow: string[]): ProjectDocument => ({
  documentType,
  label: documentType,
  mustShow,
  ruleKeys: ["rule"],
  isRequired: true,
  citations: [],
  accepts: null
})
const form = (fields: ProjectField[], documents: ProjectDocument[]): ProjectTypeDefinition => ({
  subjects: ["widget"],
  groups: [{ subject: "widget", label: "Widgets", itemLabel: "Widget", help: null, isRepeatable: true, fields }],
  documents,
  formDocuments: [],
  unasked: []
})

const placement = choice("widget.placement", "Where is the widget?", ["alpha", "beta", "gamma"], ["doc:1"])
const lit = yesNo("widget.lit", "Is the widget lit?", ["doc:2"])
const sealed = yesNo("widget.sealed", "Is the widget sealed?", ["doc:3"])
const previous = form([placement, lit], [document("plan", ["where it goes"]), document("photo", [])])
const latest = form(
  [choice("widget.placement", "Where is the widget?", ["alpha", "beta", "delta"], ["doc:1"]), sealed],
  [document("plan", ["where it goes", "how tall it is"]), document("sketch", [])]
)
// The administrator's form: placement reworded, with an added "Delta" and gamma hidden; lit kept; their own question
// and document; a citation the newer rulebook no longer has.
const own: ProjectField = { ...base, kind: "text", property: "custom.why", binding: null, label: "Why?", citations: [] }
const stored = form(
  [
    {
      ...placement,
      label: "Where does it go?",
      citations: ["doc:1", "doc:gone"],
      options: [
        { value: "widget.placement.alpha", label: "alpha", isAdded: false },
        { value: "widget.placement.beta", label: "beta", isAdded: false },
        { value: "delta", label: "Delta", isAdded: true }
      ]
    },
    lit,
    own
  ],
  [document("plan", ["where it goes"]), document("photo", []), { ...document("custom.letter", []), ruleKeys: [] }]
)
const provisions = new Set(["doc:1", "doc:2", "doc:3"])

describe("rulebookChanges", () => {
  it("finds what changed in the rules the form rests on, and where an edit of the administrator's now conflicts", () => {
    const changes = rulebookChanges(stored, previous, latest, provisions)
    expect(changes.map((change) => [change.kind, change.key, change.detail])).toEqual([
      [
        "question-changed",
        "widget.placement",
        "The rulebook's list adds “delta” and drops “gamma”. Your added “Delta” is now on the rulebook's list."
      ],
      ["citation-gone", "widget.placement", "It cites a passage the rulebook no longer has."],
      ["question-gone", "widget.lit", "The rules no longer ask this."],
      ["question-new", "widget.sealed", "The rules now ask this."],
      ["document-changed", "plan", "It must now show: where it goes; how tall it is."],
      ["document-gone", "photo", "The rules no longer require it."],
      ["document-new", "sketch", "The rules now require it."]
    ])
  })

  it("finds nothing when the newer rulebook changes nothing the form rests on", () => {
    expect(rulebookChanges(previous, previous, previous, provisions)).toEqual([])
  })
})

describe("carriedForward", () => {
  // The administrator's own wording and question, on a form whose rules a newer rulebook doesn't touch.
  const edited = form([{ ...placement, label: "Where does it go?" }, lit, own], previous.documents)

  it("moves a form the newer rulebook doesn't change onto it, keeping the administrator's edits", () => {
    const moved = carriedForward(edited, previous, previous, provisions)
    expect(moved && allQuestions(moved).map((item) => item.field.label)).toEqual([
      "Where does it go?",
      "Is the widget lit?",
      "Why?"
    ])
  })

  it("leaves a form the newer rulebook changes for the administrator to review", () => {
    expect(carriedForward(edited, previous, latest, provisions)).toBeNull()
  })
})

describe("applyChanges", () => {
  const changes = rulebookChanges(stored, previous, latest, provisions)

  it("takes every change when all are accepted, keeping the administrator's own edits", () => {
    const updated = applyChanges(stored, latest, changes, new Set(changes.map((change) => change.id)))
    const [first, ...rest] = updated.groups[0]!.fields
    expect(first).toMatchObject({
      label: "Where does it go?",
      binding: "widget.placement",
      citations: ["doc:1"],
      options: [
        { value: "widget.placement.alpha", label: "alpha", isAdded: false },
        { value: "widget.placement.beta", label: "beta", isAdded: false },
        { value: "widget.placement.delta", label: "delta", isAdded: false }
      ]
    })
    expect(rest.map((field) => field.property)).toEqual(["custom.why", "widget.sealed"])
    expect(updated.documents.map((item) => [item.documentType, item.mustShow])).toEqual([
      ["plan", ["where it goes", "how tall it is"]],
      ["custom.letter", []],
      ["sketch", []]
    ])
  })

  it("keeps the administrator's version of what they don't accept", () => {
    const updated = applyChanges(stored, latest, changes, new Set())
    const fields = updated.groups[0]!.fields
    // The question the rules no longer ask stays as the administrator's own; the missing passage stays cited.
    expect(fields.map((field) => [field.property, field.binding])).toEqual([
      ["widget.placement", "widget.placement"],
      ["widget.lit", null],
      ["custom.why", null]
    ])
    expect(fields[0]?.citations).toEqual(["doc:1", "doc:gone"])
    expect(updated.documents.map((item) => item.documentType)).toEqual(["custom.plan", "custom.photo", "custom.letter"])
    expect(updated.unasked.map((item) => item.field.property)).toContain("widget.sealed")
  })
})
