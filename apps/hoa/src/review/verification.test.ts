import { describe, expect, it } from "vitest"
import { evaluate } from "@/engine/evaluate"
import type * as T from "@/schema/types"
import { fenceAnswers, fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import type { Packet } from "./packet"
import { citedPages, decidingFacts, escalationGroup, isConfirmed, settle, verificationGroup } from "./verification"

const rulesFile = fenceRulesFile()
const request = fenceRequest()
const evaluateFacts = (facts: T.Fact[]) =>
  evaluate({ rulesFile, request: { ...request, facts }, answers: fenceAnswers(), evaluatedAt: "2026-09-10T00:00:00Z" })

const keyOf = (fact: T.Fact) => `${fact.entity} ${fact.property}`
const factOf = (entity: string, property: string) => {
  const found = request.facts.find((fact) => fact.entity === entity && fact.property === property)
  if (!found) {
    throw new Error(`No ${entity} ${property} in the fixture.`)
  }
  return found
}
const horizontal = factOf("run-1", "fence-run.board-orientation")
const horizontalValue: T.FactValue = { type: "value", term: "board-orientation.horizontal", text: "horizontal" }
const vertical: T.FactValue = { type: "value", term: "board-orientation.vertical", text: "vertical" }

describe("the verification pass", () => {
  it("picks the packet's facts that alone decide a finding", () => {
    const deciding = decidingFacts(evaluateFacts(request.facts), request.facts, evaluateFacts).map(keyOf)
    // Horizontal boards alone fail "no horizontal boards" on each run, the gate's vertical boards alone fail "gate boards
    // coordinate", and a run's material alone meets the materials rule; the portal's own facts are never read again.
    expect(deciding).toEqual(
      expect.arrayContaining([keyOf(horizontal), "gate-1 gate.board-orientation", "run-1 fence-run.material"])
    )
    expect(deciding).not.toContain("request architectural-application.review-fee")
    expect(decidingFacts([], request.facts, evaluateFacts)).toEqual([])
  })

  it("reads one fact alone, on the pages its evidence cites", () => {
    expect(verificationGroup(horizontal)).toEqual({
      id: "run-1:fence-run.board-orientation:verify",
      entities: ["run-1"],
      properties: ["fence-run.board-orientation"],
      conditions: []
    })
    const packet: Packet = {
      files: [
        {
          id: "f2-p2",
          fileName: "picture-2.png",
          mediaType: "image/png",
          contextText: null,
          isReadable: true,
          pages: [],
          visuals: []
        }
      ],
      images: []
    }
    const cited = citedPages(
      { ...horizontal, evidence: [{ fileId: "picture-2", page: null, quote: null, region: null }] },
      packet
    )
    expect(cited({ fileId: "f2-p2", pageIndex: 1 })).toBe(true)
    expect(cited({ fileId: "f1", pageIndex: 1 })).toBe(false)
  })

  const context = { threshold: 0.8, at: "2026-09-10T00:00:00Z", secondModelId: "small", escalationModelId: "strong" }
  const verticalReading: T.Fact = { ...horizontal, value: vertical }
  const unverified = { ...horizontal, state: "uncertain" as const, value: null, candidates: [horizontalValue] }

  it("keeps a fact its second reading confirms, with nothing to record", () => {
    expect(settle(horizontal, { second: [horizontal], escalation: null }, context)).toEqual({
      fact: horizontal,
      correction: null
    })
    // A reading of the same value confirms it however sure it is; one of no value, or of another, doesn't.
    expect(isConfirmed(horizontal, [{ ...unverified, confidence: 0.5 }])).toBe(true)
    expect(isConfirmed(horizontal, [{ ...unverified, candidates: [] }])).toBe(false)
    expect(isConfirmed(horizontal, [verticalReading])).toBe(false)
    expect(isConfirmed(horizontal, [])).toBe(false)
  })

  it("holds a disputed fact conflicting or uncertain when the escalation couldn't run, and records the dispute", () => {
    const disagreeing = settle(horizontal, { second: [verticalReading], escalation: null }, context)
    expect(disagreeing.fact).toMatchObject({
      state: "conflicting",
      value: null,
      candidates: [horizontalValue, vertical]
    })
    expect(disagreeing.correction).toMatchObject({
      kind: "second-reading-disagrees",
      entity: "run-1",
      readings: [
        { by: "model", value: horizontalValue },
        { by: "second-reading", modelId: "small", value: vertical }
      ],
      result: { state: "conflicting", value: null }
    })
    expect(
      settle(horizontal, { second: [{ ...horizontal, state: "absent", value: null }], escalation: null }, context).fact
    ).toMatchObject({ state: "conflicting", candidates: [horizontalValue] })
    expect(settle(horizontal, { second: [], escalation: null }, context).fact).toMatchObject({
      state: "uncertain",
      value: null,
      candidates: [horizontalValue]
    })
  })

  it("settles a dispute when the escalation confirms one of the readings, and only then", () => {
    const kept = settle(horizontal, { second: [verticalReading], escalation: [horizontal] }, context)
    expect(kept.fact).toMatchObject({ state: "known", value: horizontalValue })
    expect(kept.correction).toMatchObject({
      kind: "escalated",
      readings: [{ by: "model" }, { by: "second-reading" }, { by: "escalation", modelId: "strong" }],
      result: { state: "known", value: horizontalValue }
    })
    const changed = settle(horizontal, { second: [verticalReading], escalation: [verticalReading] }, context)
    expect(changed.fact).toMatchObject({ state: "known", value: vertical, candidates: [] })
    // The stronger model must be sure: an unsure confirmation settles nothing, nor does a third value.
    const unsure = { ...unverified, confidence: 0.5 }
    const unsettled = settle(horizontal, { second: [verticalReading], escalation: [unsure] }, context)
    expect(
      settle(
        horizontal,
        {
          second: [{ ...verticalReading, state: "uncertain", value: null, candidates: [vertical], confidence: 0.5 }],
          escalation: [verticalReading]
        },
        context
      ).fact
    ).toMatchObject({ state: "known", value: vertical })
    expect(unsettled.fact).toMatchObject({ state: "conflicting", value: null })
    expect(unsettled.correction?.result).toEqual({ state: "conflicting", value: null })
  })

  it("names the escalation's call after the fact", () => {
    expect(escalationGroup(horizontal).id).toBe("run-1:fence-run.board-orientation:escalate")
  })
})
