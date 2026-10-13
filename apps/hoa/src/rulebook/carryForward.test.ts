// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { Issue, Provision, Review, Rule, Term } from "@/schema/types"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { carryForward, carryNoRules, ruleContentHash, termContentHash, type ReviewedRulebook } from "./carryForward"

const sample = sampleRulesFile()
const proposed: Review = { status: "proposed", by: null, at: null, note: null }
const approved: Review = { status: "approved", by: "admin", at: "2026-10-01T00:00:00Z", note: "Checked" }
const rejected: Review = { status: "rejected", by: "admin", at: "2026-10-02T00:00:00Z", note: "Not a rule" }
const at = "2026-10-09T00:00:00Z"

function pick<R>(records: R[], index: number): R {
  const record = records[index]
  if (!record) {
    throw new Error(`The sample has no record ${index}`)
  }
  return structuredClone(record)
}

const rule: Rule = { ...pick(sample.rules, 0), review: proposed, issues: [] }
const otherRule: Rule = { ...pick(sample.rules, 1), review: proposed, issues: [] }
const term: Term = { ...pick(sample.terms, 0), review: proposed, issues: [] }
const settings = { ...sample.settings, review: proposed, issues: [] }
const question = { ...pick(sample.questions, 0), answer: null }

const built = (records: Partial<ReviewedRulebook> = {}): ReviewedRulebook => ({
  rules: [rule, otherRule],
  terms: [term],
  settings,
  questions: [question],
  ...records
})

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
  it("keeps the approvals and rejections of records whose key and content are unchanged", async () => {
    const published = built({
      rules: [
        { ...rule, review: approved },
        { ...otherRule, review: rejected }
      ],
      terms: [{ ...term, review: approved }]
    })
    const carried = await carryForward(
      built({ rules: [rule, { ...otherRule, statement: `${otherRule.statement} Changed.` }] }),
      [published]
    )
    expect(carried.rules.map((record) => record.review)).toEqual([approved, proposed])
    expect(carried.terms[0]?.review).toEqual(approved)

    const unchanged = await carryForward(built(), [published])
    expect(unchanged.rules.map((record) => record.review)).toEqual([approved, rejected])
  })

  it("lets the current draft decide before the published rulebook", async () => {
    const draft = built({ rules: [{ ...rule, review: rejected }, otherRule] })
    const published = built({
      rules: [
        { ...rule, review: approved },
        { ...otherRule, review: approved }
      ]
    })
    const carried = await carryForward(built(), [draft, published])
    // The draft holds both unchanged: its rejection and its still-proposed record decide.
    expect(carried.rules.map((record) => record.review)).toEqual([rejected, proposed])

    // A record the draft changed falls back to the published rulebook's decision.
    const changedDraft = built({ rules: [{ ...rule, title: "Edited", review: approved }] })
    const fallback = await carryForward(built(), [changedDraft, published])
    expect(fallback.rules.map((record) => record.review)).toEqual([approved, approved])
  })

  it("carries the resolutions of the issues the record had", async () => {
    const issue: Issue = { code: "conflict", message: "two definitions", related: [], resolution: null }
    const resolution = { note: "Checked with the board", by: "admin", at }
    const other: Issue = { ...issue, message: "something new" }
    const draft = built({ rules: [{ ...rule, review: approved, issues: [{ ...issue, resolution }] }] })
    const carried = await carryForward(built({ rules: [{ ...rule, issues: [issue, other] }] }), [draft])
    expect(carried.rules[0]?.issues).toEqual([{ ...issue, resolution }, other])
  })

  it("keeps the administrator's policy, the settings' review when they're unchanged, and answers", async () => {
    const policy = { ...settings.policy, thresholds: { factConfidence: 0.9, judgmentConfidence: 0.7 } }
    const answer = { option: 0, text: null, by: "admin", at }
    const draft = built({
      settings: { ...settings, policy, review: approved },
      questions: [{ ...question, id: "q-old", answer }]
    })
    const carried = await carryForward(built({ questions: [{ ...question, id: "q-new" }] }), [draft])
    expect(carried.settings).toMatchObject({ policy, review: approved })
    expect(carried.questions).toEqual([{ ...question, id: "q-new", answer }])

    // A clause the documents state comes from the rebuild, and a changed one needs review again.
    const deciders = settings.clauses.deciders.map((decider) => ({ ...decider, party: "board" }))
    expect(deciders.every((decider) => decider.citations.length > 0)).toBe(true)
    const changedClauses = { ...settings.clauses, deciders }
    const rebuilt = await carryForward(built({ settings: { ...settings, clauses: changedClauses } }), [draft])
    expect(rebuilt.settings).toMatchObject({ policy, review: proposed, clauses: { deciders } })
    const reworded = await carryForward(built({ questions: [{ ...question, question: "Reworded?" }] }), [draft])
    expect(reworded.questions[0]?.answer).toBeNull()
  })

  it("keeps a clause the documents don't state as the administrator set it", async () => {
    const time = { ...settings.clauses.time, zone: "America/Denver", holidays: "us-wa", citations: [] }
    const cure = {
      value: 30,
      unit: "calendar-day",
      after: { path: ["violation.observed-on"] },
      curedBy: null,
      citations: []
    }
    const draft = built({ settings: { ...settings, clauses: { ...settings.clauses, time, cure }, review: approved } })
    const rebuilt = built({
      settings: {
        ...settings,
        clauses: { ...settings.clauses, time: { ...time, zone: "America/Los_Angeles" }, cure: null }
      }
    })
    const carried = await carryForward(rebuilt, [draft])
    expect(carried.settings.clauses).toMatchObject({ time, cure })
    expect(carried.settings.review).toEqual(approved)
  })

  it("keeps nothing for new records or with no earlier rulebook", async () => {
    expect(await carryForward(built(), [])).toEqual(built())
  })
})

describe("carryNoRules", () => {
  const provision: Provision = { ...pick(sample.provisions, 0), noRule: null }
  const reason = { reason: "explanatory" as const, note: "Background only" }

  it("keeps the review of a reason the build gives again for the same wording", async () => {
    const stored = { ...provision, noRule: { ...reason, review: approved }, anchors: [] }
    const rebuilt = { ...provision, noRule: { ...reason, review: proposed } }
    expect(await carryNoRules([rebuilt], [stored], new Set())).toEqual([{ ...rebuilt, noRule: stored.noRule }])

    const reworded = { ...rebuilt, text: `${rebuilt.text} Amended.` }
    expect(await carryNoRules([reworded], [stored], new Set())).toEqual([reworded])
    const otherReason = { ...rebuilt, noRule: { ...rebuilt.noRule, reason: "recital" as const } }
    expect(await carryNoRules([otherReason], [stored], new Set())).toEqual([otherReason])
  })

  it("brings back a reviewed reason for a provision the build leaves uncovered", async () => {
    const stored = { ...provision, noRule: { ...reason, review: approved } }
    expect(await carryNoRules([provision], [stored], new Set([provision.key]))).toEqual([stored])
    expect(await carryNoRules([provision], [stored], new Set())).toEqual([provision])
    const unreviewed = { ...provision, noRule: { ...reason, review: proposed } }
    expect(await carryNoRules([provision], [unreviewed], new Set([provision.key]))).toEqual([provision])
  })
})
