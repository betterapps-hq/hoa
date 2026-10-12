import { describe, expect, it } from "vitest"
import { storedTerm } from "@/schema/exampleRulebook.test-data"
import type * as T from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import type { TermDraft } from "@/schema/zod"
import {
  filterSubjects,
  labelWithin,
  subjectSummary,
  termSubjects,
  type TermNode,
  type TermSubject
} from "./VocabularyTab.utils"

const labels = (text: string) => [{ text, role: "preferred" as const }]
const thing = (key: string, nature: "object" | "party" = "object"): TermDraft => ({
  key,
  kind: "thing",
  nature,
  labels: labels(key)
})
const property = (key: string, of: string, valueType: T.ValueType): TermDraft => ({
  key,
  kind: "property",
  of,
  valueType,
  ifUnstated: "unknown",
  labels: labels(key.replace(".", " ").replaceAll("-", " "))
})
const valueSet = (key: string): TermDraft => ({ key, kind: "value-set", complete: true, labels: labels(key) })
const value = (key: string, set: string): TermDraft => ({ key, kind: "value", set, labels: labels(key) })

const drafts: TermDraft[] = [
  thing("gate"),
  thing("neighbor", "party"),
  property("gate.height", "gate", { type: "quantity", unit: "inch" }),
  property("gate.material", "gate", { type: "choice", set: "material" }),
  property("gate.post-material", "gate", { type: "choice", set: "material" }),
  {
    key: "tall-gate",
    kind: "category",
    of: "gate",
    criteria: { type: "text", text: "tall" },
    labels: labels("tall gate")
  },
  property("tall-gate.latch", "tall-gate", { type: "boolean" }),
  valueSet("material"),
  value("material.wood", "material"),
  value("material.vinyl", "material"),
  valueSet("unused-list"),
  value("unused-list.one", "unused-list"),
  { key: "acre", kind: "unit", dimension: "area", perBase: null, labels: labels("acre") },
  // A detail of a core request type, and one choosing from a core list.
  property("architectural-application.decision", "architectural-application", {
    type: "choice",
    set: "decision-status"
  })
]

const terms = drafts.map(storedTerm)
const vocabulary = createVocabulary(terms)
const usage = new Map<T.TermKey, T.RuleKey[]>([
  ["gate.material", ["r1", "r2"]],
  ["gate.height", ["r1"]],
  ["material.vinyl", ["r3"]],
  ["neighbor", ["r4"]]
])
const subjects = termSubjects(terms, { vocabulary, usage })
const subjectOf = (key: string) => subjects.find((item) => item.key === key)!
const keys = (nodes: TermNode[]) => nodes.map((node) => node.key)

describe("termSubjects", () => {
  it("lists each term nothing holds as a subject in its section, most used first", () => {
    expect(subjects.map((item) => [item.key, item.section])).toEqual([
      ["gate", "object"],
      ["neighbor", "party"],
      ["acre", "unit"],
      ["architectural-application", "request"],
      ["unused-list", "list"]
    ])
  })

  it("holds kinds and details under their subject, most used first, and every rule they're read by", () => {
    const gate = subjectOf("gate")
    expect(keys(gate.details)).toEqual(["gate.material", "gate.height", "gate.post-material"])
    expect(keys(gate.kinds)).toEqual(["tall-gate"])
    expect(keys(gate.kinds[0]!.details)).toEqual(["tall-gate.latch"])
    expect(gate.rules).toEqual(["r1", "r2", "r3"])
  })

  it("gives each choice property its list, and a core list its core choices", () => {
    const material = subjectOf("gate").details[0]!
    expect(material.choices?.key).toBe("material")
    expect(keys(material.choices!.values)).toEqual(["material.wood", "material.vinyl"])
    const decision = subjectOf("architectural-application").details[0]!
    expect(decision.choices?.term).toBeNull()
    expect(keys(decision.choices!.values)).toContain("decision-status.approved")
    expect(subjectOf("architectural-application").term).toBeNull()
  })
})

describe("filterSubjects", () => {
  const approve = (keysApproved: string[]): TermSubject[] => {
    const approved = terms.map((term) =>
      keysApproved.includes(term.key) ? { ...term, review: { ...term.review, status: "approved" as const } } : term
    )
    return termSubjects(approved, { vocabulary, usage })
  }

  it("keeps everything without filters", () => {
    const shown = filterSubjects(subjects, { status: "all" }, null)
    expect(shown).toHaveLength(subjects.length)
    expect(
      shown
        .find((item) => item.subject.key === "gate")
        ?.matched.map((term) => term.key)
        .toSorted()
    ).toEqual([
      "gate",
      "gate.height",
      "gate.material",
      "gate.post-material",
      "material",
      "material.vinyl",
      "material.wood",
      "tall-gate",
      "tall-gate.latch"
    ])
  })

  it("keeps a subject for what under it matches the review, and only those details", () => {
    const shown = filterSubjects(approve(["gate.height"]), { status: "approved" }, null)
    expect(shown.map((item) => item.subject.key)).toEqual(["gate"])
    const [gate] = shown
    expect(keys(gate!.shown.details)).toEqual(["gate.height"])
    expect(gate!.shown.kinds).toEqual([])
    expect(gate!.matched.map((term) => term.key)).toEqual(["gate.height"])
  })

  it("keeps a detail for a choice that matches, with all the list's choices", () => {
    const [gate] = filterSubjects(subjects, { status: "all" }, ["material.vinyl"])
    expect(keys(gate!.shown.details)).toEqual(["gate.material", "gate.post-material"])
    expect(keys(gate!.shown.details[0]!.choices!.values)).toEqual(["material.wood", "material.vinyl"])
    expect(gate!.matched.map((term) => term.key)).toEqual(["material.vinyl"])
  })

  it("shows all of a subject the search finds, best match first", () => {
    const shown = filterSubjects(subjects, { status: "all" }, ["neighbor", "gate"])
    const gate = shown.find((item) => item.subject.key === "gate")!
    expect(keys(gate.shown.details)).toEqual(keys(subjectOf("gate").details))
    expect(shown.toSorted((a, b) => a.rank - b.rank).map((item) => item.subject.key)).toEqual(["neighbor", "gate"])
  })
})

describe("subjectSummary", () => {
  it("says what a subject holds, and how much of it the filters keep", () => {
    const gate = subjectOf("gate")
    expect(subjectSummary(gate, gate)).toBe("3 questions and 1 kind")
    expect(subjectSummary({ ...gate, details: gate.details.slice(0, 1), kinds: [] }, gate)).toBe("1 of 3 questions")
    expect(subjectSummary(subjectOf("unused-list"), subjectOf("unused-list"))).toBe("1 choice")
  })
})

describe("labelWithin", () => {
  it("drops the holder's name a label starts with", () => {
    expect(labelWithin("gate height", "gate")).toBe("height")
    expect(labelWithin("Gate", "gate")).toBe("Gate")
    expect(labelWithin("gateway", "gate")).toBe("gateway")
  })
})
