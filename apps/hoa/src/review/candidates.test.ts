import { describe, expect, it } from "vitest"
import { fenceRulesFile } from "@/tests/fenceSchemaFixture"
import { sampleRulesFile } from "@/tests/sampleRulesFile"
import { candidateTypes } from "./candidates"
import { documentTypes, rulebookVocabulary } from "./documentTypes"
import { requestEntities, withIdentified } from "./subjects"

describe("candidateTypes", () => {
  const candidates = candidateTypes(fenceRulesFile(), "architectural-application")
  const keys = candidates.map((candidate) => candidate.key)

  it("lists the things the request's rules apply to, what they reference and the parties who sign", () => {
    expect(keys).toEqual(expect.arrayContaining(["fence-run", "gate", "work", "owner"]))
    expect(keys).not.toContain("architectural-application")
    expect(keys).not.toContain("lot")
    expect(candidates.find((candidate) => candidate.key === "gate")?.references).toEqual([
      { property: "gate.fence-run", labels: expect.any(Array), to: "fence-run" }
    ])
    expect(candidates.find((candidate) => candidate.key === "owner")?.isSigner).toBe(true)
  })

  it("lists the space being converted for the garage enclosure", () => {
    expect(candidateTypes(sampleRulesFile(), "architectural-application").map((candidate) => candidate.key)).toContain(
      "space-conversion"
    )
  })
})

describe("documentTypes", () => {
  it("offers the rulebook's document types, their categories and the generic kinds", () => {
    const keys = documentTypes(fenceRulesFile(), "architectural-application").map((kind) => kind.key)
    expect(keys).toEqual(
      expect.arrayContaining(["neighbor-approval-form", "plans", "plot-plan", "photo", "drawing", "other"])
    )
    expect(keys.filter((key) => key === "photo")).toHaveLength(1)
  })
})

describe("requestEntities", () => {
  const candidates = candidateTypes(fenceRulesFile(), "architectural-application")
  const vocabulary = rulebookVocabulary(fenceRulesFile())
  const roots = { requestType: "architectural-application", projectLabel: "Fence" }
  const evidence = [{ fileId: "f", page: 1, quote: "left side" }]

  it("adds the request, lot, community and the work, and drops types that aren't candidates", () => {
    const {
      entities,
      dropped,
      evidence: named
    } = requestEntities(
      {
        entities: [
          { id: "run-1", type: "fence-run", label: "Left side run", evidence, refersTo: [], kinds: [] },
          { id: "tree-1", type: "tree", label: "Maple", evidence: [], refersTo: [], kinds: [] },
          { id: "run-1", type: "fence-run", label: "Again", evidence: [], refersTo: [], kinds: [] }
        ]
      },
      candidates,
      roots,
      vocabulary
    )
    expect(entities.map((entity) => [entity.id, entity.type, entity.label])).toEqual([
      ["request", "architectural-application", "The application"],
      ["lot", "lot", "The lot"],
      ["community", "community", "The community"],
      ["run-1", "fence-run", "Left side run"],
      ["work-1", "work", "Fence"]
    ])
    expect(dropped).toEqual(["tree-1 (tree)", "run-1 (a repeated id)"])
    expect(named).toEqual([{ entity: "run-1", evidence: [{ ...evidence[0], region: null }] }])
  })

  it("reads each reference it names to a kept entity of the right type as a fact answer", () => {
    const { readings } = requestEntities(
      {
        entities: [
          { id: "run-4", type: "fence-run", label: "Return run", evidence, refersTo: [], kinds: [] },
          {
            id: "gate-1",
            type: "gate",
            label: "Gate on the return run",
            evidence,
            kinds: [],
            refersTo: [
              { property: "gate.fence-run", entity: "run-4", confidence: 0.9 },
              { property: "gate.fence-run", entity: "gate-1", confidence: 0.9 },
              { property: "gate.color", entity: "run-4", confidence: 0.9 },
              { property: "gate.fence-run", entity: "run-9", confidence: 0.9 }
            ]
          }
        ]
      },
      candidates,
      roots,
      vocabulary
    )
    expect(readings).toEqual([
      {
        entity: "gate-1",
        property: "gate.fence-run",
        state: "known",
        stated: null,
        reading: "run-4",
        evidence,
        confidence: 0.9
      }
    ])
  })

  it("reads a kind whose criteria fix a property as that property's value", () => {
    const { readings } = requestEntities(
      {
        entities: [
          {
            id: "run-4",
            type: "fence-run",
            label: "Return to the house",
            evidence,
            refersTo: [],
            kinds: [
              { kind: "return-fence", confidence: 0.9 },
              { kind: "boundary-fence", confidence: 0.9 },
              { kind: "gate", confidence: 0.9 }
            ]
          }
        ]
      },
      candidates,
      roots,
      vocabulary
    )
    expect(readings).toEqual([
      expect.objectContaining({ entity: "run-4", property: "fence-run.location", reading: "fence-location.return" })
    ])
  })
})

describe("withIdentified", () => {
  const reading = (entity: string, value: string, confidence: number) => ({
    entity,
    property: "fence-run.location",
    state: "known" as const,
    stated: null,
    reading: value,
    evidence: [],
    confidence
  })

  it("lets a sure identification reading stand, and weighs an unsure one with the facts stage's", () => {
    const facts = [reading("run-4", "fence-location.front", 0.6), reading("run-3", "fence-location.side", 0.9)]
    const identified = [reading("run-4", "fence-location.return", 0.9), reading("run-3", "fence-location.rear", 0.5)]
    expect(withIdentified(facts, identified, 0.8)).toEqual([facts[1], ...identified])
  })
})
