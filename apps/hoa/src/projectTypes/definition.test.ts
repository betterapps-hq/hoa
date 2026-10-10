import { describe, expect, it } from "vitest"
import {
  addDocument,
  addQuestion,
  candidateDocuments,
  candidateQuestions,
  choiceErrors,
  choiceRows,
  customKey,
  moveDocument,
  movedText,
  moveItem,
  moveQuestion,
  offeredChoices,
  removeDocument,
  removeQuestion,
  sectionsOf,
  updateQuestion
} from "./definition"
import type { ProjectField, ProjectTypeDefinition } from "./projectType"

const field = (property: string, answeredBy: "applicant" | "association" = "applicant"): ProjectField => ({
  kind: "text",
  property,
  binding: property,
  label: `What is the ${property}?`,
  help: null,
  example: null,
  isRequired: false,
  answeredBy,
  citations: []
})

const section = (subject: string, fields: ProjectField[]) => ({
  subject,
  label: `${subject}s`,
  itemLabel: subject,
  help: null,
  isRepeatable: subject !== "work",
  fields
})

const document = (documentType: string) => ({
  documentType,
  label: documentType,
  mustShow: [],
  ruleKeys: ["r1"],
  isRequired: true,
  citations: [],
  accepts: null
})

// What the rules can ask for a synthetic project: the work's own details and an item's.
const available: ProjectTypeDefinition = {
  subjects: ["item"],
  groups: [
    section("work", [field("start"), field("waiver", "association")]),
    section("item", [field("a"), field("b"), field("c")])
  ],
  documents: [document("plan"), document("photo"), document("letter")],
  formDocuments: [],
  unasked: []
}

const form: ProjectTypeDefinition = {
  ...available,
  groups: [section("item", [field("a"), field("b"), field("c")])],
  documents: [document("plan"), document("photo")]
}

describe("moving", () => {
  it("moves an item within its list and leaves an impossible move alone", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"])
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"])
    expect(moveItem(["a", "b"], 0, 5)).toEqual(["a", "b"])
  })

  it("reorders a section's questions and the documents, the order homeowners see", () => {
    const moved = moveQuestion(form, "item", 2, 0)
    expect(moved.groups[0]!.fields.map((item) => item.property)).toEqual(["c", "a", "b"])
    expect(moveDocument(form, 1, 0).documents.map((item) => item.documentType)).toEqual(["photo", "plan"])
  })

  it("says where an item moved, counting from one", () => {
    expect(movedText("Size", 2, 12)).toBe("Moved “Size” to position 3 of 12.")
  })
})

describe("removing and adding questions", () => {
  it("keeps a removed question aside with its wording, so adding it back keeps it", () => {
    const worded = updateQuestion(form, "item", { ...field("b"), label: "Which b?" })
    const removed = removeQuestion(worded, "item", "b")
    expect(removed.groups[0]!.fields.map((item) => item.property)).toEqual(["a", "c"])
    const candidates = candidateQuestions(removed, available)
    expect(candidates.map((item) => `${item.subject} ${item.field.property}`)).toEqual([
      "work start",
      "work waiver",
      "item b"
    ])
    expect(candidates.find((item) => item.field.property === "b")?.field.label).toBe("Which b?")
    const restored = addQuestion(removed, available, "item", candidates[2]!.field, 1)
    expect(restored.groups[0]!.fields.map((item) => item.label)).toEqual([
      "What is the a?",
      "Which b?",
      "What is the c?"
    ])
    expect(restored.unasked).toEqual([])
  })

  it("brings a section back where the rules put it when its first question is added", () => {
    const added = addQuestion(form, available, "work", field("start"))
    expect(added.groups.map((group) => group.subject)).toEqual(["work", "item"])
  })

  it("drops a section whose last question is removed", () => {
    const one = { ...form, groups: [section("item", [field("a")])] }
    expect(removeQuestion(one, "item", "a").groups).toEqual([])
  })
})

describe("the administrator's own questions", () => {
  const own: ProjectField = { ...field("custom.why"), binding: null, label: "Why now?" }

  it("adds one to the project's section, even when the rules ask nothing about the project", () => {
    const added = addQuestion(form, available, "work", own)
    expect(added.groups.map((group) => group.subject)).toEqual(["work", "item"])
    expect(addQuestion({ ...form, groups: [] }, { ...available, groups: [] }, "work", own).groups[0]!.label).toBe(
      "The project"
    )
  })

  it("drops one for good when it's removed, and never suggests it", () => {
    const added = addQuestion(form, available, "item", own)
    const removed = removeQuestion(added, "item", "custom.why")
    expect(removed.unasked).toEqual([])
    expect(candidateQuestions(removed, available).some((item) => item.field.property === "custom.why")).toBe(false)
  })

  it("keys each by its wording, unique in the form", () => {
    const added = addQuestion(form, available, "item", { ...own, property: "custom.why-now" })
    expect(customKey(added, "Why now?")).toBe("custom.why-now-2")
    expect(customKey(form, "  ")).toBe("custom.question")
    expect(sectionsOf(form, available).map((section) => section.subject)).toEqual(["work", "item"])
  })
})

describe("documents", () => {
  it("offers the documents the rules require that the form leaves out, and adds or removes one", () => {
    expect(candidateDocuments(form, available).map((item) => item.documentType)).toEqual(["letter"])
    const added = addDocument(form, document("letter"), 0)
    expect(added.documents.map((item) => item.documentType)).toEqual(["letter", "plan", "photo"])
    expect(removeDocument(added, "plan").documents.map((item) => item.documentType)).toEqual(["letter", "photo"])
  })
})

describe("a bound choice's list", () => {
  const listed = [
    { value: "place.a", label: "front", isAdded: false },
    { value: "place.b", label: "side", isAdded: false }
  ]
  const row = (label: string, value = "") => ({ id: label, value, label, isAdded: true, isOffered: true })

  it("lists what it offers in its order, then the rulebook's values it hides", () => {
    const own = { value: "back", label: "Back", isAdded: true }
    expect(choiceRows([own, listed[1]!], listed).map((item) => [item.label, item.isOffered])).toEqual([
      ["Back", true],
      ["side", true],
      ["front", false]
    ])
  })

  it("keys a new added choice from its label, unique among the values, and keeps a renamed one's key", () => {
    const rows = [...choiceRows(listed, listed), row("Back", "back"), row("Back!"), row("  "), row("Place a")]
    expect(offeredChoices(rows, listed)).toEqual([
      ...listed,
      { value: "back", label: "Back", isAdded: true },
      { value: "back-2", label: "Back!", isAdded: true },
      { value: "place-a", label: "Place a", isAdded: true }
    ])
  })

  it("asks for at least one choice and never adds one the rulebook's list or the list already has", () => {
    const hidden = choiceRows(listed, listed).map((item) => ({ ...item, isOffered: false }))
    expect(choiceErrors(hidden, listed)).toEqual(["Offer at least one choice."])
    expect(choiceErrors([...hidden, row("FRONT"), row("Back"), row("back ")], listed)).toEqual([
      "The rulebook's list has “front”: show it instead of adding it.",
      "“back” is on the list twice."
    ])
  })
})
