import { describe, expect, it } from "vitest"
import type { Rule } from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"
import { golden, goldenRule } from "./pair.test-data"
import { probesOf } from "./probes"

const vocabulary = createVocabulary([...golden.terms])

describe("probesOf", () => {
  it("collects every path a rule reads with the constants it's compared with", () => {
    const probes = probesOf(goldenRule("guidelines:5.5.1(i)#max-height"), vocabulary)
    expect(probes).toContainEqual({
      kind: "fact",
      from: "subject",
      path: ["fence-run.material"],
      constants: [
        { type: "value", term: "fence-material.wood" },
        { type: "value", term: "fence-material.composite" }
      ]
    })
    expect(probes).toContainEqual({
      kind: "fact",
      from: "subject",
      path: ["fence-run.height"],
      constants: [{ type: "quantity", value: 72, unit: "inch" }]
    })
    // The return-fence category's criteria read the location.
    expect(probes).toContainEqual({
      kind: "fact",
      from: "subject",
      path: ["fence-run.location"],
      constants: [{ type: "value", term: "fence-location.return" }]
    })
  })

  it("prefixes paths inside a quantifier, and collects approvals, documents, judgments and text conditions", () => {
    const base = goldenRule("guidelines:5.5.1(i)#max-height")
    if (base.kind !== "norm") {
      throw new Error("Expected a norm")
    }
    const rule: Rule = {
      ...base,
      appliesWhen: {
        type: "all",
        of: [
          {
            type: "some",
            path: ["fence-run.gates"],
            where: null,
            test: {
              type: "compare",
              left: { type: "ref", path: ["gate.height"] },
              op: ">",
              right: { type: "number", value: 4 }
            }
          },
          { type: "text", text: "the fence is visible from the street" },
          { type: "approved", path: [], by: ["committee"], needs: "all", prior: true, written: true }
        ]
      },
      check: { type: "judgment", question: "Is it in harmony?", evidence: [] }
    }
    const probes = probesOf(rule, vocabulary)
    expect(probes).toContainEqual({ kind: "fact", from: "subject", path: ["fence-run.gates"], constants: [] })
    expect(probes).toContainEqual({
      kind: "fact",
      from: "subject",
      path: ["fence-run.gates", "gate.height"],
      constants: [{ type: "number", value: 4 }]
    })
    expect(probes).toContainEqual({ kind: "text", text: "the fence is visible from the street" })
    expect(probes).toContainEqual({ kind: "approval", parties: ["committee"] })
    expect(probes).toContainEqual({ kind: "judgment" })
  })

  it("collects a document check's document and signers", () => {
    const base = goldenRule("guidelines:5.5.1(i)#max-height")
    const rule: Rule =
      base.kind === "norm"
        ? {
            ...base,
            appliesWhen: null,
            check: { type: "document", document: "plans", per: "request", mustState: [], signedBy: ["owner"] }
          }
        : base
    expect(probesOf(rule, vocabulary)).toEqual([{ kind: "document", document: "plans", signedBy: ["owner"] }])
  })
})
