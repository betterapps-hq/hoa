import { describe, expect, it } from "vitest"
import {
  draftDocuments,
  draftProvisions,
  firstDraft,
  parsedDraft,
  secondDraft,
  vocabulary
} from "@/tests/encodingDrafts"
import { mergeDrafts } from "./merge"

const merge = (drafts = [firstDraft, secondDraft]) =>
  mergeDrafts({
    organizationId: "org-1",
    documents: draftDocuments,
    provisions: draftProvisions,
    vocabulary,
    units: drafts.map((draft, i) => ({ unitId: `unit-${i + 1}`, draft: parsedDraft(draft) }))
  })

describe("mergeDrafts", () => {
  const merged = merge()

  it("merges terms by key: labels and citations combine, a second definition is a conflict", () => {
    const shed = merged.rulebook.terms.find((term) => term.key === "shed")
    expect(shed?.labels.map((label) => [label.text, label.role])).toEqual([
      ["shed", "preferred"],
      ["storage shed", "alternative"]
    ])
    expect(shed?.citations.map((citation) => citation.provisionKey)).toEqual(["rules:1", "rules:2(a)"])
    expect(shed?.definition).toBe("A small building for storage.")
    expect(merged.conflicts).toContainEqual({ recordKey: "shed", message: "shed has two definitions", related: [] })
    expect(merged.rulebook.terms.every((term) => term.organizationId === "org-1")).toBe(true)
  })

  it("reports a term defined with two kinds and keeps the first", () => {
    const valueSet = { key: "shed", kind: "value-set" as const, labels: [{ text: "shed", role: "preferred" as const }] }
    const other = { ...secondDraft, terms: [valueSet] }
    const { rulebook, conflicts } = merge([firstDraft, other])
    expect(rulebook.terms.find((term) => term.key === "shed")?.kind).toBe("thing")
    expect(conflicts).toContainEqual({
      recordKey: "shed",
      message: "shed is defined as a thing and as a value-set",
      related: []
    })
  })

  it("gives a repeated rule key a suffix and a conflict on both", () => {
    expect(merged.rulebook.rules.map((rule) => rule.key)).toEqual([
      "declaration:4.1#sheds-allowed",
      "rules:1#max-height",
      "rules:1#max-height-2",
      "rules:2(a)#max-height"
    ])
    expect(merged.conflicts.filter((conflict) => conflict.recordKey.startsWith("rules:1#"))).toEqual([
      {
        recordKey: "rules:1#max-height",
        message: "unit unit-2 gave a second rule the key rules:1#max-height",
        related: ["rules:1#max-height-2"]
      },
      {
        recordKey: "rules:1#max-height-2",
        message: "unit unit-2 gave a second rule the key rules:1#max-height",
        related: ["rules:1#max-height"]
      }
    ])
  })

  it("concatenates clause citations and raises disagreeing clauses as conflicts", () => {
    const { clauses } = merged.rulebook.settings
    expect(clauses.precedence?.citations.map((citation) => citation.provisionKey)).toEqual([
      "declaration:4.1",
      "rules:2"
    ])
    expect(clauses.deciders).toHaveLength(1)
    expect(merged.conflicts).toContainEqual({
      recordKey: "settings",
      message: "unit unit-2 names another decider for architectural-application",
      related: []
    })
  })

  it("merges the remaining clauses: liability lists add up, time and cure must agree", () => {
    const time = {
      days: "calendar-day",
      rollForward: true,
      holidays: "us-federal",
      zone: "America/Denver",
      citations: []
    }
    const cure = { value: 30, unit: "calendar-day", after: { path: [] }, curedBy: null, citations: [] }
    const liability = [{ actor: "tenant", liable: "owner", appliesWhen: null, until: null, except: [], citations: [] }]
    const condition = { type: "text" as const, text: "notice was given" }
    const sanctionPreconditions = [{ requestTypes: ["violation"], condition, except: [], citations: [] }]
    const with1 = { ...firstDraft, clauses: { time, cure, liability, sanctionPreconditions } }
    const with2 = { ...secondDraft, clauses: { time: { ...time, rollForward: false }, cure, liability } }
    const { rulebook, conflicts } = merge([with1, with2])
    expect(rulebook.settings.clauses.liability).toHaveLength(2)
    expect(rulebook.settings.clauses.sanctionPreconditions).toHaveLength(1)
    expect(rulebook.settings.clauses.cure?.value).toBe(30)
    expect(conflicts.map((conflict) => conflict.message)).toContain("unit unit-2 gives other time rules")
  })

  it("adds referenced documents once, with no edition", () => {
    expect(merged.rulebook.documents.map((document) => [document.key, document.edition === null])).toEqual([
      ["declaration", false],
      ["rules", false],
      ["by-laws", true]
    ])
  })

  it("records no-rule reasons and reports uncovered provisions", () => {
    expect(merged.rulebook.provisions.find((provision) => provision.key === "rules:2")?.noRule).toEqual({
      reason: "explanatory",
      note: "Introduces the list.",
      review: { status: "proposed", by: null, at: null, note: null }
    })
    expect(merged.coverage).toEqual({ provisions: 5, uncovered: ["rules:3"] })
  })

  it("lists near-duplicate terms for consolidation", () => {
    expect(merged.termPairs).toEqual([{ keys: ["shed", "garden-shed"], labels: ["shed", "Sheds"], score: 0.9 }])
  })

  it("numbers questions and records where every record came from", () => {
    expect(merged.rulebook.questions.map((question) => question.id)).toEqual(["question-1"])
    expect(merged.sources.get("rules:1#max-height-2")).toEqual([{ unitId: "unit-2", path: ["rules", 0] }])
    expect(merged.sources.get("shed")?.map((source) => source.unitId)).toEqual(["unit-1", "unit-2"])
    expect(merged.sources.get("settings")).toHaveLength(2)
  })

  it("verifies the merged set across units", () => {
    expect(merged.issues).toEqual([
      {
        code: "coverage",
        message: "it's cited, so it has no reason for having no rule",
        recordKey: "rules:2",
        path: ["noRule"]
      },
      {
        code: "coverage",
        message: "nothing cites it, and it has no reason for having no rule",
        recordKey: "rules:3",
        path: ["noRule"]
      }
    ])
  })
})
