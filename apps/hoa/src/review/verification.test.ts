import { describe, expect, it } from "vitest"
import { evaluate } from "@/engine/evaluate"
import type * as T from "@/schema/types"
import { fenceAnswers, fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import type { Packet } from "./packet"
import { citedPages, decidingFacts, verificationGroup, verified } from "./verification"

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
  it("picks the packet's facts that alone decide a not-met finding", () => {
    const deciding = decidingFacts(evaluateFacts(request.facts), request.facts, evaluateFacts).map(keyOf)
    // Horizontal boards alone fail "no horizontal boards" on each run, and the gate's vertical boards alone fail
    // "gate boards coordinate"; the portal's own facts are never read again.
    expect(deciding).toEqual(expect.arrayContaining([keyOf(horizontal), "gate-1 gate.board-orientation"]))
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

  it("keeps a fact its reading confirms, and holds it conflicting or uncertain otherwise", () => {
    expect(verified(horizontal, [horizontal], 0.8)).toBe(horizontal)
    expect(verified(horizontal, [{ ...horizontal, value: vertical }], 0.8)).toMatchObject({
      state: "conflicting",
      value: null,
      candidates: [horizontalValue, vertical]
    })
    expect(verified(horizontal, [{ ...horizontal, state: "absent", value: null }], 0.8)).toMatchObject({
      state: "conflicting",
      candidates: [horizontalValue]
    })
    // A confident reading whose quote didn't verify still confirms the first reading's value; an unsure one doesn't.
    const unverified = { ...horizontal, state: "uncertain" as const, value: null, candidates: [horizontalValue] }
    expect(verified(horizontal, [{ ...unverified, confidence: 0.9 }], 0.8)).toBe(horizontal)
    for (const readings of [[], [{ ...unverified, confidence: 0.5 }]]) {
      expect(verified(horizontal, readings, 0.8)).toMatchObject({
        state: "uncertain",
        value: null,
        candidates: [horizontalValue]
      })
    }
  })
})
