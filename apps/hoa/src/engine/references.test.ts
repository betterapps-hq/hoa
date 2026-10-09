import { describe, expect, it } from "vitest"
import { entity, exampleContext, fact, reference, term } from "@/tests/engineContext"
import { settledContext, settlements, unsettledReferences } from "./references"

const uncertainRun = { ...fact("gate-1", "gate.fence-run", null, "uncertain"), candidates: [reference("run-1")] }

describe("unsettled references (schema.md, Expressions 4)", () => {
  const context = exampleContext({
    extra: [entity("gate-1", "gate"), entity("run-1", "fence-run"), entity("run-2", "fence-run")],
    facts: [uncertainRun, fact("gate-1", "gate.color", term("composite-color.saddle"), "uncertain")]
  })

  it("lists every thing of the referenced type an uncertain or conflicting reference could name, once", () => {
    const reads = [
      { entity: "gate-1", property: "gate.fence-run", state: "uncertain" as const },
      { entity: "gate-1", property: "gate.fence-run", state: "uncertain" as const },
      { entity: "gate-1", property: "gate.color", state: "uncertain" as const }
    ]
    expect(unsettledReferences(context, reads)).toEqual([{ fact: uncertainRun, candidates: ["run-1", "run-2"] }])
    expect(unsettledReferences(context, [{ entity: "gate-1", property: "gate.fence-run", state: "known" }])).toEqual([])
  })

  it("settles them every way, up to a limit", () => {
    const ways = settlements([{ fact: uncertainRun, candidates: ["run-1", "run-2"] }])
    expect(ways.map((facts) => facts.map(({ state, value }) => ({ state, value })))).toEqual([
      [{ state: "known", value: reference("run-1") }],
      [{ state: "known", value: reference("run-2") }]
    ])
    const many = Array.from({ length: 65 }, (_, index) => `run-${index}`)
    expect(settlements([{ fact: uncertainRun, candidates: many }])).toEqual([])
    expect(settlements([])).toEqual([])
  })

  it("reads a settlement in place of the fact it settles", () => {
    const [way = []] = settlements([{ fact: uncertainRun, candidates: ["run-2"] }])
    const settled = settledContext(context, way)
    expect(settled.facts("gate-1", "gate.fence-run")).toMatchObject([{ state: "known", value: reference("run-2") }])
    expect(settled.facts("gate-1", "gate.color")).toEqual(context.facts("gate-1", "gate.color"))
  })
})
