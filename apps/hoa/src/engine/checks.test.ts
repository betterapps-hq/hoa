import { describe, expect, it } from "vitest"
import * as ex from "@/schema/examples.test-data"
import type { Check, EvaluationRequest } from "@/schema/types"
import { date, entity, exampleContext, fact, quantity, reference, term, yes } from "@/tests/engineContext"
import { evaluateCheck } from "./checks"
import type { Answers } from "./context"

type Parts = Partial<EvaluationRequest> & { extra?: EvaluationRequest["entities"] }

const statusOf = (
  check: Check | null,
  subject: string,
  parts: Parts = {},
  answers: Partial<Answers> = {},
  ruleKey = "rule"
) => evaluateCheck(exampleContext(parts, answers), ruleKey, subject, check).status

const run = (...facts: ReturnType<typeof fact>[]): Parts => ({ extra: [entity("run-1", "fence-run")], facts })

describe("test checks", () => {
  it("comply when the condition is true, fail when false, and are unknown otherwise", () => {
    const check = ex.maxHeight.check ?? null
    expect(statusOf(check, "run-1", run(fact("run-1", "fence-run.height", quantity(70))))).toBe("complies")
    expect(statusOf(check, "run-1", run(fact("run-1", "fence-run.height", quantity(80))))).toBe("fails")
    expect(statusOf(check, "run-1", run())).toBe("unknown")
  })

  it("fail with no check at all: a prohibition of the subject itself", () => {
    expect(statusOf(null, "run-1", run())).toBe("fails")
  })
})

describe("table checks", () => {
  const colors = ex.compositeColors.check ?? null
  const fenceOf = (manufacturer: string | null, color: string) =>
    run(
      ...(manufacturer ? [fact("run-1", "fence-run.manufacturer", term(manufacturer))] : []),
      fact("run-1", "fence-run.color", term(color))
    )

  it("takes the matching row's result, or otherwise", () => {
    expect(statusOf(colors, "run-1", fenceOf("composite-manufacturer.trex", "composite-color.saddle"))).toBe("complies")
    expect(statusOf(colors, "run-1", fenceOf("composite-manufacturer.trex", "composite-color.river-birch"))).toBe(
      "fails"
    )
  })

  it("is unknown when unknown rows could give another result, and known when every result is the same", () => {
    expect(statusOf(colors, "run-1", fenceOf(null, "composite-color.teak"))).toBe("unknown")
    // No listed manufacturer offers this color, so every possible row says not met.
    expect(statusOf(colors, "run-1", fenceOf(null, "composite-color.storm"))).toBe("fails")
  })

  it("matches any, not-in and range cells", () => {
    const table: Check = {
      type: "table",
      inputs: [
        { type: "ref", path: ["fence-run.height"] },
        { type: "ref", path: ["fence-run.color"] }
      ],
      rows: [
        {
          when: [
            {
              type: "range",
              min: null,
              max: { type: "quantity", value: 72, unit: "inch" },
              includeMin: true,
              includeMax: true
            },
            { type: "not-in", values: [{ type: "value", term: "composite-color.teak" }] }
          ],
          result: "met",
          citation: null
        },
        {
          when: [
            {
              type: "range",
              min: { type: "quantity", value: 72, unit: "inch" },
              max: null,
              includeMin: false,
              includeMax: true
            },
            { type: "any" }
          ],
          result: "not-met",
          citation: null
        }
      ],
      otherwise: "met"
    }
    const fenceWith = (height: number, color: string) =>
      run(fact("run-1", "fence-run.height", quantity(height)), fact("run-1", "fence-run.color", term(color)))
    expect(statusOf(table, "run-1", fenceWith(70, "composite-color.saddle"))).toBe("complies")
    expect(statusOf(table, "run-1", fenceWith(80, "composite-color.saddle"))).toBe("fails")
    expect(statusOf(table, "run-1", fenceWith(70, "composite-color.teak"))).toBe("complies")
    expect(statusOf(table, "run-1", run(fact("run-1", "fence-run.color", term("composite-color.saddle"))))).toBe(
      "unknown"
    )
  })
})

describe("document checks", () => {
  const neighborApproval = ex.neighborApproval.check ?? null
  const ruleKey = ex.neighborApproval.key
  const statements = ex.neighborApproval.check?.type === "document" ? ex.neighborApproval.check.mustState : []
  const withForm = (signedBy: string[]): Parts => ({
    extra: [entity("run-1", "fence-run"), entity("neighbor-1", "neighbor")],
    documents: [{ id: "file-1", type: "neighbor-approval-form", subjects: ["run-1"], signedBy }]
  })
  const reviewed = (confirmed: (boolean | null)[]): Partial<Answers> => ({
    documentReviews: [
      {
        ruleKey,
        entity: "run-1",
        statements: statements.map((statement, i) => ({ statement, confirmed: confirmed[i] ?? null, quote: null }))
      }
    ]
  })
  const allConfirmed = statements.map(() => true)

  it("is unknown when the document is missing, naming it", () => {
    const result = evaluateCheck(exampleContext(run()), ruleKey, "run-1", neighborApproval)
    expect(result).toMatchObject({ status: "unknown", missing: ["neighbor approval form"] })
  })

  it("complies when every statement is confirmed and the party signed", () => {
    expect(statusOf(neighborApproval, "run-1", withForm(["neighbor-1"]), reviewed(allConfirmed), ruleKey)).toBe(
      "complies"
    )
  })

  it("fails when the document contradicts a statement, and is unknown when one isn't confirmed or it's unsigned", () => {
    expect(
      statusOf(neighborApproval, "run-1", withForm(["neighbor-1"]), reviewed([true, false, true, true]), ruleKey)
    ).toBe("fails")
    expect(
      statusOf(neighborApproval, "run-1", withForm(["neighbor-1"]), reviewed([true, null, true, true]), ruleKey)
    ).toBe("unknown")
    expect(statusOf(neighborApproval, "run-1", withForm(["neighbor-1"]), {}, ruleKey)).toBe("unknown")
    const unsigned = evaluateCheck(
      exampleContext(withForm([]), reviewed(allConfirmed)),
      ruleKey,
      "run-1",
      neighborApproval
    )
    expect(unsigned).toMatchObject({ status: "unknown", missing: ["a signature from the neighbor"] })
  })

  it("needs every one of a party's signatures on a document for the request", () => {
    const signatures: Check = {
      type: "document",
      document: "site-plan",
      per: "request",
      mustState: [],
      signedBy: ["owner"]
    }
    const owners = (signedBy: string[], owners = ["owner-1", "owner-2"]): Parts => ({
      extra: owners.map((id) => entity(id, "owner")),
      documents: [{ id: "file-1", type: "site-plan", subjects: [], signedBy }]
    })
    expect(statusOf(signatures, "request", owners(["owner-1", "owner-2"]))).toBe("complies")
    expect(statusOf(signatures, "request", owners(["owner-1"]))).toBe("unknown")
    expect(statusOf(signatures, "request", owners([], []))).toBe("unknown")
  })
})

describe("judgment checks", () => {
  const sightLines = ex.sightLines.check ?? null
  const ruleKey = ex.sightLines.key
  const judged = (answer: "yes" | "no" | "unclear", confidence: number): Partial<Answers> => ({
    judgments: [{ ruleKey, entity: "run-1", answer, confidence, rationale: "From the site plan.", evidence: [] }]
  })

  it("decides only at or above the judgment confidence threshold", () => {
    expect(statusOf(sightLines, "run-1", run(), judged("yes", 0.9), ruleKey)).toBe("complies")
    expect(statusOf(sightLines, "run-1", run(), judged("no", 0.8), ruleKey)).toBe("fails")
    expect(statusOf(sightLines, "run-1", run(), judged("no", 0.6), ruleKey)).toBe("unknown")
    expect(statusOf(sightLines, "run-1", run(), judged("unclear", 0.95), ruleKey)).toBe("unknown")
    expect(statusOf(sightLines, "run-1", run(), {}, ruleKey)).toBe("unknown")
  })

  it("keeps the answer on the result", () => {
    const result = evaluateCheck(exampleContext(run(), judged("no", 0.6)), ruleKey, "run-1", sightLines)
    expect(result.judgment).toEqual({ answer: "no", confidence: 0.6, rationale: "From the site plan.", evidence: [] })
  })
})

describe("approval checks", () => {
  const priorApproval = ex.priorApproval.check ?? null
  const work = (...facts: ReturnType<typeof fact>[]): Parts => ({
    extra: [entity("work-1", "work"), ...(facts.length > 0 ? [entity("approval-1", "approval")] : [])],
    facts
  })
  const approval = (status: string) => [
    fact("approval-1", "approval.covers", reference("work-1")),
    fact("approval-1", "approval.by", term("committee")),
    fact("approval-1", "approval.status", term(status)),
    fact("approval-1", "approval.on", date("2026-01-20")),
    fact("approval-1", "approval.written", yes)
  ]

  it("waits on the decision in an application, and fails elsewhere", () => {
    expect(statusOf(priorApproval, "work-1", work())).toBe("awaiting-decision")
    expect(statusOf(priorApproval, "work-1", { ...work(), type: "violation" })).toBe("fails")
  })

  it("complies when approved, fails when denied, and is unknown when unclear", () => {
    expect(statusOf(priorApproval, "work-1", work(...approval("approval-status.approved")))).toBe("complies")
    expect(statusOf(priorApproval, "work-1", work(...approval("approval-status.denied")))).toBe("fails")
    const unclear = approval("approval-status.approved").map((found) =>
      found.property === "approval.by" ? { ...found, state: "conflicting" as const } : found
    )
    expect(statusOf(priorApproval, "work-1", work(...unclear))).toBe("unknown")
  })
})
