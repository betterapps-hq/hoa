import { describe, expect, it } from "vitest"
import type { FactAnswer } from "./factSchema"
import { reconcileReadings, secondReadingGroups } from "./secondReading"

const answer = (overrides: Partial<FactAnswer>): FactAnswer => ({
  entity: "run-1",
  property: "fence-run.board-orientation",
  state: "known",
  stated: null,
  reading: "board-orientation.horizontal",
  evidence: [{ fileId: "photo", page: 1, quote: "horizontal boards" }],
  confidence: 0.7,
  ...overrides
})

const entities = [
  { id: "run-1", type: "fence-run" },
  { id: "run-2", type: "fence-run" },
  { id: "gate-1", type: "gate" }
]
const groups = [
  {
    id: "fence-run",
    entities: ["run-1", "run-2"],
    properties: ["fence-run.board-orientation", "fence-run.color"],
    conditions: ["c1"]
  },
  { id: "gate", entities: ["gate-1"], properties: ["gate.material"], conditions: [] }
]

describe("secondReadingGroups", () => {
  it("asks again only for the entities and properties read below the threshold", () => {
    const answers = [
      answer({}),
      answer({ entity: "run-2", property: "fence-run.color", reading: "composite-color.river-birch", confidence: 0.9 }),
      answer({ entity: "run-2", property: "fence-run.height", state: "absent", reading: null, confidence: 0.5 }),
      answer({ entity: "gate-1", property: "gate.material", state: "uncertain", reading: null, stated: null })
    ]
    expect(secondReadingGroups(groups, answers, entities, 0.8)).toEqual([
      { id: "fence-run:second", entities: ["run-1"], properties: ["fence-run.board-orientation"], conditions: [] }
    ])
  })

  it("asks again for every property of an entity skipped while others of its type were answered", () => {
    const answers = [answer({ confidence: 0.9 })]
    expect(secondReadingGroups(groups, answers, entities, 0.8)).toEqual([
      {
        id: "fence-run:second",
        entities: ["run-2"],
        properties: ["fence-run.board-orientation", "fence-run.color"],
        conditions: []
      }
    ])
  })
})

describe("reconcileReadings", () => {
  it("keeps the more confident of two agreeing readings, with both readings' evidence", () => {
    const again = answer({
      confidence: 0.9,
      evidence: [{ fileId: "photo", page: 1, quote: "boards run horizontally" }]
    })
    const [reconciled] = reconcileReadings([answer({ state: "uncertain" })], [again], 0.8)
    expect(reconciled).toMatchObject({ state: "known", confidence: 0.9 })
    expect(reconciled?.evidence).toHaveLength(2)
  })

  it("leaves the first reading as it was when the second disagrees, finds none, or the first was sure", () => {
    const first = [answer({}), answer({ entity: "run-2" }), answer({ entity: "run-3", confidence: 0.85 })]
    const second = [
      answer({ reading: "board-orientation.vertical", confidence: 0.95 }),
      answer({ entity: "run-3", confidence: 0.95 })
    ]
    expect(reconcileReadings(first, second, 0.8)).toEqual(first)
  })

  it("adds a skipped entity's second reading as its only one", () => {
    const skipped = answer({ entity: "run-4", confidence: 0.9 })
    expect(reconcileReadings([answer({ confidence: 0.9 })], [skipped, answer({ confidence: 0.95 })], 0.8)).toEqual([
      answer({ confidence: 0.9 }),
      skipped
    ])
  })

  it("matches readings by the words when the model gave no reading", () => {
    const first = answer({ reading: null, stated: "River Birch", property: "fence-run.color" })
    const again = answer({ reading: null, stated: "river birch ", property: "fence-run.color", confidence: 0.85 })
    expect(reconcileReadings([first], [again], 0.8)[0]?.confidence).toBe(0.85)
  })
})
