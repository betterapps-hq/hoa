import { describe, expect, it } from "vitest"
import { advanceProgress, finishProgress, startProgress, stopProgress } from "./progress"

const stages = [{ stage: "structure" }, { stage: "encode" }, { stage: "repair", isOptional: true }, { stage: "merge" }]
const workload = { concurrency: 4, documents: 1 }
const statuses = (progress: ReturnType<typeof startProgress>) => progress.steps.map((step) => step.status)

describe("job progress", () => {
  it("lists every stage up front, and moves through them as the job reports", () => {
    const start = startProgress(stages, workload)
    expect(statuses(start)).toEqual(["upcoming", "upcoming", "upcoming", "upcoming"])

    const structuring = advanceProgress(start, { stage: "structure", done: 0, total: 1 }, "t1")
    const encoding = advanceProgress(structuring, { stage: "encode", done: 0, total: 10 }, "t2")
    expect(statuses(encoding)).toEqual(["done", "current", "upcoming", "upcoming"])
    expect(encoding.steps[0]).toMatchObject({ startedAt: "t1", finishedAt: "t2" })
    expect(encoding.steps[1]).toMatchObject({ done: 0, total: 10, startedAt: "t2" })
  })

  it("never takes a count back when parallel reports land out of order", () => {
    const encoding = advanceProgress(startProgress(stages, workload), { stage: "encode", done: 5, total: 10 }, "t1")
    const late = advanceProgress(encoding, { stage: "encode", done: 4, total: 10 }, "t2")
    expect(late.steps[1]).toMatchObject({ done: 5, startedAt: "t1" })
  })

  it("skips an optional stage with nothing to do, and a stage the job never reached", () => {
    const start = startProgress(stages, workload)
    const repairing = advanceProgress(start, { stage: "repair", done: 0, total: 0 }, "t1")
    const merging = advanceProgress(repairing, { stage: "merge", done: 0, total: 1 }, "t2")
    expect(statuses(merging)).toEqual(["skipped", "skipped", "skipped", "current"])
    expect(statuses(finishProgress(merging, "t3"))).toEqual(["skipped", "skipped", "skipped", "done"])
  })

  it("adds a stage the list doesn't have, and leaves the rest upcoming when stopped", () => {
    const start = startProgress(stages, workload)
    const encoding = advanceProgress(start, { stage: "encode", done: 2, total: 10 }, "t1")
    const stopped = stopProgress(encoding, "t2")
    expect(statuses(stopped)).toEqual(["skipped", "current", "upcoming", "upcoming"])
    expect(stopped.steps[1]?.finishedAt).toBe("t2")
    expect(advanceProgress(start, { stage: "audit", done: 0, total: 1 }, "t1").steps.at(-1)).toMatchObject({
      stage: "audit",
      status: "current"
    })
  })
})
