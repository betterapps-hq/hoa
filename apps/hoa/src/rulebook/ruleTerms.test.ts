import { describe, expect, it } from "vitest"
import type * as T from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import type { RulebookRecords } from "./assemble"
import { reviewIssues, termKeysOf } from "./review"
import { changeRuleTerm, copiesForRule, pickableTerms, swapCandidates, withTermsReplaced } from "./ruleTerms"

const stamp = { by: "admin", at: "2026-10-12T00:00:00Z" }
const copyStamp = { ...stamp, organizationId: "org-sample" }
const ageRule = "declaration:3.1(a)#age-55-occupant"

function sampleRecords(): RulebookRecords {
  const file = sampleRulesFile()
  return { ...file, terms: [...file.terms, ...file.proposedCore] }
}

function ruleOf(records: RulebookRecords, key = ageRule) {
  const rule = records.rules.find((item) => item.key === key)
  if (!rule) {
    throw new Error(`The sample has no rule ${key}.`)
  }
  return rule
}

describe("withTermsReplaced", () => {
  it("swaps a term in the statement's links, plural kept, and in every field, but not in the bookkeeping", () => {
    const rule: T.Rule = {
      ...ruleOf(sampleRecords()),
      statement: "Each {{residence}} needs {{residence:plural}} and {{owner}}.",
      provenance: { by: "person", userId: "residence", at: stamp.at }
    }
    const swapped = withTermsReplaced(rule, new Map([["residence", "dwelling"]]))
    expect(swapped.statement).toBe("Each {{dwelling}} needs {{dwelling:plural}} and {{owner}}.")
    expect(swapped.appliesTo).toBe("dwelling")
    expect(swapped.provenance).toEqual(rule.provenance)
    // A detail is its own term: swapping the thing leaves the keys of its details alone.
    expect(termKeysOf(swapped)).toContain("residence.occupants")
  })
})

describe("swapCandidates", () => {
  const records = sampleRecords()
  const vocabulary = createVocabulary(records.terms)
  const terms = pickableTerms(records.terms)
  const candidates = (from: string, rule = ruleOf(records)) =>
    swapCandidates(vocabulary, terms, rule, from).map((term) => term.key)

  it("offers the same thing's other kinds for a kind whose thing's details the rule reads", () => {
    expect(
      candidates("qualifying-permanent-resident", ruleOf(records, "declaration:3.1(a)(i)#surviving-occupant"))
    ).toEqual(expect.arrayContaining(["occupant", "minor"]))
    // The age rule reads a residence's occupants, and nothing else is a residence.
    expect(candidates("residence")).toEqual([])
  })

  it("offers any thing or kind of the same nature for one whose details the rule doesn't read", () => {
    const found = swapCandidates(vocabulary, terms, ruleOf(records), "owner")
    expect(found.map((term) => term.key)).toEqual(expect.arrayContaining(["tenant", "occupant"]))
    expect(
      found.every((term) => {
        const thing = vocabulary.get(vocabulary.thingOf(term.key))
        return thing?.kind === "thing" && thing.nature === "party"
      })
    ).toBe(true)
  })

  it("offers a detail of the same thing holding the same kind of value, and a choice from the same list", () => {
    const notify = ruleOf(records, "declaration:3.1(c)/p3#notify-board")
    expect(candidates("lease-registration.reported-on", notify).toSorted()).toEqual([
      "lease-registration.received-on",
      "lease-registration.signed-on"
    ])
    expect(
      candidates("leased-premises.principal-dwelling", ruleOf(records, "declaration:3.1(c)#entire-dwelling")).toSorted()
    ).toEqual(["leased-premises.accessory-dwelling", "leased-premises.part-of-dwelling"])
    expect(candidates("occupant.born-on")).toEqual([])
  })
})

describe("copiesForRule", () => {
  it("copies a thing with the details the rule reads of it, keyed as the schema keys them, all proposed", () => {
    const records = sampleRecords()
    const vocabulary = createVocabulary(records.terms)
    const copy = { label: "Senior residence", definition: "A residence in the 55-and-over area." }
    const { terms, mapping } = copiesForRule(vocabulary, ruleOf(records), "residence", copy, copyStamp)
    expect(Object.fromEntries(mapping)).toEqual({
      residence: "senior-residence",
      "residence.occupants": "senior-residence.occupants"
    })
    const [named, detail] = terms
    expect(named).toMatchObject({
      key: "senior-residence",
      kind: "thing",
      organizationId: "org-sample",
      definition: copy.definition,
      labels: [{ text: "Senior residence", role: "preferred" }],
      provenance: { by: "person", userId: "admin" },
      review: { status: "proposed" }
    })
    expect(detail).toMatchObject({ key: "senior-residence.occupants", kind: "property", of: "senior-residence" })
  })

  it("names a copied detail under its own thing, and never reuses a key", () => {
    const records = sampleRecords()
    const vocabulary = createVocabulary(records.terms)
    const { mapping } = copiesForRule(
      vocabulary,
      ruleOf(records),
      "occupant.born-on",
      { label: "Born on", definition: null },
      copyStamp
    )
    expect(mapping.get("occupant.born-on")).toBe("occupant.born-on-2")
  })
})

describe("changeRuleTerm", () => {
  it("has the rule read a new term made from a copy, and stays as valid as it was", () => {
    const records = sampleRecords()
    const before = reviewIssues(records).get(ageRule) ?? []
    const { rule, terms } = changeRuleTerm(
      records,
      { ruleKey: ageRule, from: "residence", change: { type: "copy", label: "Senior residence", definition: null } },
      stamp
    )
    expect(rule.appliesTo).toBe("senior-residence")
    expect(rule.statement).toContain("{{senior-residence}}")
    expect(termKeysOf(rule)).toContain("senior-residence.occupants")
    expect(rule.review.status).toBe("proposed")
    expect(rule.provenance).toEqual({ by: "person", userId: "admin", at: stamp.at })
    const changed = {
      ...records,
      rules: records.rules.map((item) => (item.key === ageRule ? rule : item)),
      terms: [...records.terms, ...terms]
    }
    expect(reviewIssues(changed).get(ageRule) ?? []).toEqual(before)
    for (const term of terms) {
      expect(reviewIssues(changed).get(term.key) ?? []).toEqual([])
    }
  })

  it("swaps in a term that fits, and refuses one that doesn't or a term the rule doesn't use", () => {
    const records = sampleRecords()
    const vocabulary = createVocabulary(records.terms)
    const [fitting] = swapCandidates(vocabulary, pickableTerms(records.terms), ruleOf(records), "owner")
    const { rule, terms } = changeRuleTerm(
      records,
      { ruleKey: ageRule, from: "owner", change: { type: "term", key: fitting?.key ?? "" } },
      stamp
    )
    expect(terms).toEqual([])
    expect(termKeysOf(rule)).not.toContain("owner")
    expect(termKeysOf(rule)).toContain(fitting?.key)
    expect(() =>
      changeRuleTerm(
        records,
        { ruleKey: ageRule, from: "owner", change: { type: "term", key: "residence.occupants" } },
        stamp
      )
    ).toThrow("doesn't fit")
    expect(() =>
      changeRuleTerm(records, { ruleKey: ageRule, from: "pet", change: { type: "term", key: "animal" } }, stamp)
    ).toThrow("doesn't use that term")
  })
})
