import { describe, expect, it } from "vitest"
import { decide } from "@/engine/decide"
import type { ActionGroup } from "@/engine/decide"
import { evaluate } from "@/engine/evaluate"
import { rulebookVocabulary } from "@/review/documentTypes"
import type { ActionItem } from "@/review/reviewModel"
import { fenceAnswers, fenceRequest, fenceRulesFile } from "@/tests/fenceSchemaFixture"
import type { ExpectedReview } from "./cases"
import { alignEntities, scoreReview } from "./score"

const rulesFile = fenceRulesFile()
const request = fenceRequest()
const findings = evaluate({ rulesFile, request, answers: fenceAnswers(), evaluatedAt: "2026-09-10T12:00:00Z" })
const decision = decide(findings, rulesFile, request.type)
const items = (groups: ActionGroup[]): ActionItem[] =>
  groups.map((group, index) => ({ id: `i${index}`, ruleKey: group.ruleKey, entities: group.entities, text: "" }))
const result = {
  request,
  documents: [],
  findings,
  recommendation: decision.recommendation,
  normalizations: [
    {
      entity: "run-1",
      property: "fence-run.color",
      stated: "River Birch",
      matchedLabel: "River Birch",
      kind: "exact" as const,
      score: 1
    }
  ],
  changes: items(decision.changes),
  missingInformation: items(decision.missingInformation),
  committeeDecisions: items(decision.committeeDecisions)
}

// The expected result names the runs its own way; the review's ids differ.
const expected: ExpectedReview = {
  entities: [
    { id: "left", type: "fence-run", label: "Left side run" },
    { id: "gate", type: "gate", label: "Gate on the return run" },
    { id: "extra", type: "gate", label: "A second gate" }
  ],
  facts: [
    {
      entity: "left",
      property: "fence-run.color",
      state: "known",
      value: { type: "value", term: "composite-color.river-birch", text: "" }
    },
    { entity: "left", property: "fence-run.height", state: "unknown", value: null },
    { entity: "left", property: "fence-run.lattice-height", state: "absent", value: null },
    {
      entity: "left",
      property: "fence-run.material",
      state: "known",
      value: { type: "value", term: "fence-material.wood", text: "" }
    }
  ],
  documents: [],
  findings: {
    "guidelines:5.4.2(i)#colors left": "not-met",
    "guidelines:5.9.1#gate-boards gate": "not-met",
    "guidelines:5.3#materials left": "not-met"
  },
  recommendation: "request-information",
  actionItems: {
    changes: [{ ruleKey: "guidelines:5.4.2(i)#colors", entities: ["left"] }],
    missingInformation: [],
    committeeDecisions: []
  }
}

describe("scoreReview", () => {
  const scored = scoreReview(result, expected, {
    vocabulary: rulebookVocabulary(rulesFile),
    pageText: () => null
  })

  it("aligns expected entities to the review's by type and label", () => {
    expect(alignEntities(expected.entities, request.entities).get("left")).toBe("run-1")
    expect(scored.alignment.gate).toBe("gate-1")
  })

  it("aligns by label before id: the model's run-1 needn't be the expected run-1", () => {
    const alignment = alignEntities(
      [
        { id: "run-1", type: "fence-run", label: "Rear run along the open space" },
        { id: "run-3", type: "fence-run", label: "Left side run" }
      ],
      request.entities
    )
    expect(alignment.get("run-1")).toBe("run-3")
    expect(alignment.get("run-3")).toBe("run-1")
  })

  it("compares an expected reference through the alignment", () => {
    const gateRun: ExpectedReview = {
      ...expected,
      entities: [...expected.entities, { id: "return", type: "fence-run", label: "Short run from the left side line" }],
      facts: [
        { entity: "gate", property: "gate.fence-run", state: "known", value: { type: "entity", entity: "return" } }
      ]
    }
    const scoredReference = scoreReview(result, gateRun, {
      vocabulary: rulebookVocabulary(rulesFile),
      pageText: () => null
    })
    expect(scoredReference.alignment.return).toBe("run-4")
    expect(scoredReference.mismatches.facts).toEqual([])
  })

  it("scores each measure with the mismatches behind it", () => {
    expect(scored.scores).toMatchObject({
      facts: 3 / 4,
      findings: 2 / 3,
      recommendation: 1,
      normalization: 1,
      evidence: null
    })
    // fence runs: 1 expected, 4 found; gates: 2 expected, 1 found; owners and work found but not expected.
    expect(scored.mismatches.entities.map((mismatch) => mismatch.type)).toEqual(["fence-run", "gate", "work", "owner"])
    expect(scored.mismatches.facts).toEqual([
      expect.objectContaining({ property: "fence-run.material", actual: ["known term fence-material.composite"] })
    ])
    expect(scored.mismatches.findings).toEqual([
      { ruleKey: "guidelines:5.3#materials", entity: "left", expected: "not-met", actual: "met" }
    ])
    expect(scored.mismatches.actionItems.missing).toEqual([])
    expect(scored.scores.actionItems).toBeGreaterThan(0)
    expect(scored.scores.actionItems).toBeLessThan(0.2)
  })
})
