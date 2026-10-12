import { describe, expect, it, vi } from "vitest"
import { recordScores, type ScoreRecorder } from "./scores"

describe("recordScores", () => {
  it("scores one span under the job's trace name and session, then sends the scores", async () => {
    const observation = vi.fn<ScoreRecorder["observation"]>()
    const flush = vi.fn<ScoreRecorder["flush"]>(async () => undefined)
    await recordScores({
      traceName: "rulebook-build",
      sessionId: "job-1",
      input: { documents: ["declaration"] },
      output: { units: 2 },
      scores: [
        { name: "units", value: 2 },
        { name: "coverage", value: 0.5, comment: "1 of 2 provisions uncovered" }
      ],
      recorder: { observation, flush }
    })
    expect(observation.mock.calls.map(([, score]) => score.name)).toEqual(["units", "coverage"])
    const [[span]] = observation.mock.calls
    expect(span?.otelSpan).toBeDefined()
    expect(observation.mock.calls.every(([item]) => item === span)).toBe(true)
    expect(flush).toHaveBeenCalledTimes(1)
  })
})
