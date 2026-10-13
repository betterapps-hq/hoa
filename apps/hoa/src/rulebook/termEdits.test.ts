import { describe, expect, it } from "vitest"
import type * as T from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import type { RulebookRecords } from "./assemble"
import { termKeysOf } from "./review"
import { pickableTerms } from "./ruleTerms"
import { addChoice, editTerm, mergeCandidates, mergeTerm, type TermEdit } from "./termEdits"

const stamp = { by: "admin", at: "2026-10-12T00:00:00Z" }
const approved: T.Review = { status: "approved", by: "admin", at: stamp.at, note: null }
const size = "exterior-item.size"
const principal = "leased-premises.principal-dwelling"
const partOf = "leased-premises.part-of-dwelling"

/** The sample with every record approved, so a test sees what an edit sends back to review. */
function approvedRecords(): RulebookRecords {
  const file = sampleRulesFile()
  return {
    ...file,
    rules: file.rules.map((rule) => ({ ...rule, review: approved })),
    terms: [...file.terms, ...file.proposedCore].map((term) => ({ ...term, review: approved }))
  }
}

const termOf = (records: RulebookRecords, key: string) => {
  const term = records.terms.find((item) => item.key === key)
  if (!term) {
    throw new Error(`The sample has no term ${key}.`)
  }
  return term
}

const editOf = (records: RulebookRecords, key: string, change: Partial<TermEdit> = {}): TermEdit => {
  const term = termOf(records, key)
  return {
    key,
    label: term.labels.find((label) => label.role === "preferred")?.text ?? key,
    alternatives: term.labels.filter((label) => label.role === "alternative").map((label) => label.text),
    definition: term.definition,
    ...change
  }
}

describe("editTerm", () => {
  it("renames a term without touching its review or its rules", () => {
    const records = approvedRecords()
    const { terms, rules } = editTerm(
      records,
      editOf(records, size, { label: "Size", alternatives: ["Dimensions"] }),
      stamp
    )
    expect(rules).toEqual([])
    expect(terms[0]?.review).toEqual(approved)
    expect(terms[0]?.labels.map(({ text, role }) => ({ text, role }))).toEqual([
      { text: "Size", role: "preferred" },
      { text: "Dimensions", role: "alternative" }
    ])
    expect(terms[0]?.provenance).toEqual({ by: "person", userId: "admin", at: stamp.at })
  })

  it("sends the term and the approved rules that read it back to review when what it means changes", () => {
    const records = approvedRecords()
    const using = records.rules.filter((rule) => termKeysOf(rule).has(size)).map((rule) => rule.key)
    expect(using.length).toBeGreaterThan(0)
    const { terms, rules } = editTerm(records, editOf(records, size, { definition: "Its widest side." }), stamp)
    expect(terms[0]?.review.status).toBe("proposed")
    expect(rules.map((rule) => rule.key).toSorted()).toEqual(using.toSorted())
    expect(rules.every((rule) => rule.review.status === "proposed")).toBe(true)
  })

  it("stores a quantity in another unit of the same kind, and refuses one of another kind", () => {
    const records = approvedRecords()
    const { terms, rules } = editTerm(records, editOf(records, size, { unit: "foot" }), stamp)
    expect(terms[0]).toMatchObject({ valueType: { type: "quantity", unit: "foot" }, review: { status: "proposed" } })
    expect(rules.length).toBeGreaterThan(0)
    expect(() => editTerm(records, editOf(records, size, { unit: "acre" }), stamp)).toThrow("same kind")
  })

  it("makes a list allow only its choices, which changes what it means", () => {
    const records = approvedRecords()
    const { terms } = editTerm(records, editOf(records, "leased-premises", { isComplete: true }), stamp)
    expect(terms[0]).toMatchObject({ kind: "value-set", complete: true, review: { status: "proposed" } })
  })
})

describe("addChoice", () => {
  it("adds a choice to a list, keyed under it, and refuses one the list has", () => {
    const records = approvedRecords()
    const choice = addChoice(records, "leased-premises", "Garage apartment", stamp)
    expect(choice).toMatchObject({
      key: "leased-premises.garage-apartment",
      kind: "value",
      set: "leased-premises",
      organizationId: records.organization.id,
      review: { status: "proposed" }
    })
    const label = termOf(records, partOf).labels.find((item) => item.role === "preferred")?.text ?? ""
    expect(() => addChoice(records, "leased-premises", label.toUpperCase(), stamp)).toThrow("already has")
    expect(() => addChoice(records, size, "Big", stamp)).toThrow("list of choices")
  })
})

describe("mergeTerm", () => {
  it("offers a choice from the same list, and nothing for a term others hang off", () => {
    const records = approvedRecords()
    const vocabulary = createVocabulary(records.terms)
    const terms = pickableTerms(records.terms)
    expect(mergeCandidates(vocabulary, terms, principal).map((term) => term.key)).toContain(partOf)
    expect(mergeCandidates(vocabulary, terms, "leased-premises")).toEqual([])
  })

  it("has every rule use the other term, sends them back to review and rejects the merged one", () => {
    const records = approvedRecords()
    const using = records.rules.filter((rule) => termKeysOf(rule).has(principal)).map((rule) => rule.key)
    const { rules, terms } = mergeTerm(records, principal, partOf, stamp)
    expect(rules.map((rule) => rule.key)).toEqual(using)
    for (const rule of rules) {
      expect(termKeysOf(rule)).not.toContain(principal)
      expect(termKeysOf(rule)).toContain(partOf)
      expect(rule.review.status).toBe("proposed")
    }
    expect(terms.find((term) => term.key === principal)?.review).toMatchObject({
      status: "rejected",
      note: expect.stringMatching(/^Merged into “.+”\.$/)
    })
    expect(() => mergeTerm(records, principal, size, stamp)).toThrow("can't be merged")
  })
})
