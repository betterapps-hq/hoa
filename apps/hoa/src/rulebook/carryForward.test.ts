// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { Review, Rule, Term } from "@/schema/types"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { carryForward, ruleContentHash, termContentHash } from "./carryForward"

const sample = sampleRulesFile()
const approved: Review = { status: "approved", by: "admin", at: "2026-10-01T00:00:00Z", note: "Checked" }
const at = "2026-10-09T00:00:00Z"

function pick<R>(records: R[], index: number): R {
  const record = records[index]
  if (!record) {
    throw new Error(`The sample has no record ${index}`)
  }
  return structuredClone(record)
}

const rule = pick(sample.rules, 0)
const otherRule = pick(sample.rules, 1)
const term = pick(sample.terms, 0)

describe("content hashes", () => {
  it("ignore bookkeeping and change with content", async () => {
    const reviewed: Rule = {
      ...rule,
      review: approved,
      provenance: { by: "person", userId: "admin", at },
      issues: [{ code: "conflict", message: "m", related: [], resolution: null }]
    }
    expect(await ruleContentHash(reviewed)).toBe(await ruleContentHash(rule))
    expect(await ruleContentHash({ ...rule, title: `${rule.title}, amended` })).not.toBe(await ruleContentHash(rule))
  })

  it("ignore a label's provenance but not its wording", async () => {
    const relabeled: Term = {
      ...term,
      review: approved,
      labels: term.labels.map((label) => ({ ...label, provenance: { by: "system", at } }))
    }
    expect(await termContentHash(relabeled)).toBe(await termContentHash(term))
    const reworded: Term = { ...term, labels: term.labels.map((label) => ({ ...label, text: `${label.text}s` })) }
    expect(await termContentHash(reworded)).not.toBe(await termContentHash(term))
  })
})

describe("carryForward", () => {
  it("keeps the approvals of records whose key and content are unchanged", async () => {
    const published = {
      rules: [
        { ...rule, review: approved },
        { ...otherRule, review: approved }
      ],
      terms: [{ ...term, review: approved }]
    }
    const draft = {
      rules: [rule, { ...otherRule, statement: `${otherRule.statement} Changed.` }],
      terms: [term]
    }

    const carried = await carryForward(draft, published)

    expect(carried.rules.map((record) => record.review.status)).toEqual(["approved", "proposed"])
    expect(carried.rules[0]?.review).toEqual(approved)
    expect(carried.terms[0]?.review).toEqual(approved)
  })

  it("keeps nothing from records that weren't approved, or that are new", async () => {
    const rejected: Review = { ...approved, status: "rejected" }
    const carried = await carryForward(
      { rules: [rule, otherRule], terms: [term] },
      { rules: [{ ...rule, review: rejected }], terms: [] }
    )
    expect(carried.rules.map((record) => record.review.status)).toEqual(["proposed", "proposed"])
    expect(carried.terms).toEqual([term])
  })
})
