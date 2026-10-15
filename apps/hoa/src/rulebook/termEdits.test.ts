import { describe, expect, it } from "vitest"
import type * as T from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import type { TermContent } from "@/schema/zod"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import type { RulebookRecords } from "./assemble"
import { termKeysOf } from "./review"
import { pickableTerms } from "./ruleTerms"
import { addChoice, editTerm, mergeCandidates, mergeTargets, mergeTerm, type TermEdit } from "./termEdits"

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

  it("finds every term's candidates by where it fits, as trying it against every other term would", () => {
    const records = approvedRecords()
    const vocabulary = createVocabulary(records.terms)
    const terms = pickableTerms(records.terms)
    // The fit written out pair by pair: the same place, and for a detail the same thing and kind of value.
    const natureOf = (key: string) => {
      const thing = vocabulary.get(vocabulary.thingOf(key))
      return thing?.kind === "thing" ? thing.nature : null
    }
    const dimensionOf = (key: string) => {
      const unit = vocabulary.get(key)
      return unit?.kind === "unit" ? unit.dimension : null
    }
    const sameValue = (a: T.ValueType, b: T.ValueType) => {
      switch (a.type) {
        case "quantity":
          return b.type === "quantity" && dimensionOf(a.unit) === dimensionOf(b.unit)
        case "choice":
          return b.type === "choice" && b.set === a.set
        case "reference":
          return b.type === "reference" && b.to === a.to
        default:
          return a.type === b.type
      }
    }
    const fits = (term: TermContent, other: TermContent) => {
      switch (term.kind) {
        case "thing":
        case "category":
          return (other.kind === "thing" || other.kind === "category") && natureOf(other.key) === natureOf(term.key)
        case "property":
          return (
            other.kind === "property" &&
            other.many === term.many &&
            vocabulary.thingOf(other.of) === vocabulary.thingOf(term.of) &&
            sameValue(other.valueType, term.valueType)
          )
        case "value":
          return other.kind === "value" && other.set === term.set
        case "unit":
          return other.kind === "unit" && other.dimension === term.dimension
        default:
          return false
      }
    }
    const isHeld = (key: string) =>
      terms.some(
        (item) =>
          ((item.kind === "property" || item.kind === "category") && item.of === key) ||
          (item.kind === "value" && item.set === key)
      )
    const tried = (key: string) => {
      const term = vocabulary.get(key)
      return !term || isHeld(key) ? [] : terms.filter((other) => other.key !== key && fits(term, other))
    }
    const targets = mergeTargets(vocabulary, terms)
    const keys = [...new Set([...terms, ...records.terms].map((term) => term.key))]
    for (const key of keys) {
      expect([key, targets(key).map((term) => term.key)]).toEqual([key, tried(key).map((term) => term.key)])
    }
    const merged = keys.filter((key) => targets(key).length > 0).map((key) => vocabulary.get(key)?.kind)
    expect(new Set(merged)).toEqual(new Set(["thing", "category", "property", "value", "unit"]))
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
