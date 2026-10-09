import { describe, expect, it } from "vitest"
import { correctionItems, type Correction } from "./corrections"

const reading = (by: Correction["readings"][number]["by"], page: number, value: string) => ({
  by,
  modelId: null,
  state: "known" as const,
  value: { type: "value" as const, term: value, text: value },
  confidence: 0.9,
  evidence: [{ fileId: "file-1", page, quote: value, region: null }]
})

const escalated: Correction = {
  kind: "escalated",
  entity: "run-1",
  property: "fence-run.board-orientation",
  stated: "horizontal",
  problems: [],
  readings: [
    reading("model", 2, "horizontal"),
    reading("second-reading", 2, "vertical"),
    reading("escalation", 3, "horizontal")
  ],
  result: { state: "known", value: { type: "value", term: "horizontal", text: "horizontal" } },
  at: "2026-10-09T00:00:00Z"
}
const disputed: Correction = {
  ...escalated,
  kind: "second-reading-disagrees",
  readings: escalated.readings.slice(0, 2),
  result: { state: "conflicting", value: null }
}
const entities = [{ id: "run-1", type: "fence-run", label: "Left side run", ref: null }]

describe("correctionItems", () => {
  it("makes a settled correction an item whose expected output is the settled fact", () => {
    const [item] = correctionItems(
      { kind: "evaluation", run: "2026-10-09T22-00-00", case: "fence" },
      [escalated],
      entities
    )
    expect(item).toMatchObject({
      id: "evaluation:2026-10-09T22-00-00:fence:run-1:fence-run.board-orientation:escalated",
      input: {
        entity: { id: "run-1", type: "fence-run", label: "Left side run" },
        property: "fence-run.board-orientation",
        pages: [
          { fileId: "file-1", page: 2 },
          { fileId: "file-1", page: 3 }
        ]
      },
      expectedOutput: escalated.result,
      metadata: { kind: "escalated", needsLabel: false }
    })
  })

  it("leaves an unsettled one for a person to label", () => {
    const [item] = correctionItems({ kind: "review", applicationId: "app-1", jobId: "job-1" }, [disputed], entities)
    expect(item).toMatchObject({
      id: "review:job-1:run-1:fence-run.board-orientation:second-reading-disagrees",
      expectedOutput: null,
      metadata: { needsLabel: true }
    })
  })
})
