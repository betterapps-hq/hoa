import { describe, expect, it } from "vitest"
import { z } from "zod"
import { reviewSchema } from "@/review/reviewModel"
import { fenceRules } from "@/tests/fenceRulebook"
import { candidateRuleSchema, ruleSchema, rulebookSchema } from "./rule"

describe("rule schemas", () => {
  it("accept every rule in the sample rulebook", () => {
    for (const rule of fenceRules) {
      expect(ruleSchema.parse(rule)).toEqual(rule)
    }
  })

  it("accept the extraction model's candidate shape and reject a missing citation", () => {
    const candidate = {
      title: "Composite colors",
      statement: "Trex fences are Winchester Grey or Saddle.",
      projectTypes: ["fence"],
      appliesTo: "segment",
      topic: "color",
      obligation: "required",
      discretion: "objective",
      isCurable: true,
      appliesWhen: [
        { type: "fact", attribute: "segment.material", operator: "equals", value: "composite" },
        { type: "text", description: "The fence faces the street" }
      ],
      check: { type: "range", attributes: ["segment.height"], min: null, max: 72 },
      exceptions: [],
      citations: [{ section: "5.4.2", pageIndex: 17, quote: "TREX: Winchester Grey and Saddle" }]
    }
    expect(candidateRuleSchema.parse(candidate)).toEqual(candidate)
    expect(candidateRuleSchema.safeParse({ ...candidate, citations: [] }).success).toBe(false)
  })

  it("convert to JSON Schema for structured model output", () => {
    expect(z.toJSONSchema(candidateRuleSchema)).toMatchObject({ type: "object" })
    expect(z.toJSONSchema(reviewSchema)).toMatchObject({ type: "object" })
  })

  it("accept a rulebook still building, before it has a version", () => {
    const rulebook = {
      id: "rulebook-1",
      hoaId: "demo-hoa",
      version: null,
      status: "building",
      error: null,
      catalogVersion: 1,
      sourceDocumentIds: ["guidelines"],
      jobId: "job-1",
      createdAt: "2026-10-08T00:00:00.000Z",
      publishedBy: null,
      publishedAt: null
    }
    expect(rulebookSchema.parse(rulebook)).toEqual(rulebook)
  })
})
