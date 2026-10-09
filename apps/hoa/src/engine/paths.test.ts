import { describe, expect, it } from "vitest"
import { entity, exampleContext, fact, quantity, reference, term } from "@/tests/engineContext"
import { resolveItems, resolvePath } from "./paths"

const scope = (id: string) => ({ subject: { type: "entity" as const, id } })

function context() {
  return exampleContext({
    extra: [
      entity("run-1", "fence-run"),
      entity("gate-1", "gate"),
      entity("gate-2", "gate"),
      entity("pet-1", "pet"),
      entity("pet-2", "pet")
    ],
    facts: [
      fact("gate-1", "gate.fence-run", reference("run-1")),
      fact("gate-2", "gate.fence-run", null, "absent"),
      fact("run-1", "fence-run.material", term("fence-material.composite")),
      fact("run-1", "fence-run.color", term("composite-color.teak"), "conflicting"),
      fact("run-1", "fence-run.setback-from-front-corner", quantity(5, "furlong")),
      fact("lot", "lot.pets", reference("pet-1")),
      { ...fact("lot", "lot.pets", reference("pet-2")), complete: true }
    ]
  })
}

describe("resolving paths (schema.md, Expressions 1, 2 and 6)", () => {
  it("follows a reference from a gate to its fence run", () => {
    const evaluation = context()
    expect(resolvePath(evaluation, scope("gate-1"), { path: ["gate.fence-run", "fence-run.material"] })).toEqual({
      state: "known",
      value: { type: "term", term: "fence-material.composite", text: "fence-material.composite" }
    })
    expect(evaluation.reads).toEqual([
      { entity: "gate-1", property: "gate.fence-run", state: "known" },
      { entity: "run-1", property: "fence-run.material", state: "known" }
    ])
  })

  it("tells unknown from absent: silence is what the property says it means", () => {
    const evaluation = context()
    expect(resolvePath(evaluation, scope("run-1"), { path: ["fence-run.height"] })).toEqual({
      state: "unknown",
      isUnstated: true,
      partial: null
    })
    expect(resolvePath(evaluation, scope("run-1"), { path: ["fence-run.lattice-height"] })).toEqual({ state: "absent" })
    expect(resolvePath(evaluation, scope("run-1"), { path: ["fence-run.color"] })).toEqual({
      state: "unknown",
      isUnstated: false,
      partial: null
    })
    expect(evaluation.reads.map((read) => read.state)).toEqual(["unknown", "absent", "conflicting"])
  })

  it("makes the property of a thing that isn't there absent", () => {
    expect(resolvePath(context(), scope("gate-2"), { path: ["gate.fence-run", "fence-run.material"] })).toEqual({
      state: "absent"
    })
  })

  it("starts from the request, the lot or the community, and an empty path is its root", () => {
    const evaluation = context()
    expect(resolvePath(evaluation, scope("run-1"), { from: "request", path: [] })).toEqual({
      state: "known",
      value: { type: "entity", id: "request" }
    })
    expect(resolvePath(evaluation, scope("run-1"), { from: "lot", path: [] })).toMatchObject({
      value: { id: "lot" }
    })
  })

  it("is unknown where a step isn't a property, can't be followed, or holds a value it can't read", () => {
    const evaluation = context()
    expect(resolvePath(evaluation, scope("run-1"), { path: ["fence-run.material", "fence-run.height"] }).state).toBe(
      "unknown"
    )
    expect(resolvePath(evaluation, scope("run-1"), { path: ["fence-run"] }).state).toBe("unknown")
    expect(resolvePath(evaluation, scope("lot"), { path: ["lot.pets"] }).state).toBe("unknown")
    expect(resolvePath(evaluation, scope("run-1"), { path: ["fence-run.setback-from-front-corner"] }).state).toBe(
      "unknown"
    )
    const value = { type: "value" as const, value: { type: "boolean" as const, value: true } }
    expect(resolvePath(evaluation, { subject: value }, { path: ["fence-run.height"] }).state).toBe("unknown")
  })

  it("lists a many-valued path's items and whether the list is whole", () => {
    expect(resolveItems(context(), scope("lot"), { path: ["lot.pets"] })).toEqual({
      items: [
        { type: "entity", id: "pet-1" },
        { type: "entity", id: "pet-2" }
      ],
      unclear: 0,
      isComplete: true
    })
    const silent = exampleContext()
    expect(resolveItems(silent, scope("lot"), { path: ["lot.pets"] })).toEqual({
      items: [],
      unclear: 0,
      isComplete: false
    })
    expect(resolveItems(silent, scope("lot"), { path: [] })).toBeNull()
    expect(resolveItems(context(), scope("gate-2"), { path: ["gate.fence-run", "lot.pets"] })).toEqual({
      items: [],
      unclear: 0,
      isComplete: true
    })
  })
})
