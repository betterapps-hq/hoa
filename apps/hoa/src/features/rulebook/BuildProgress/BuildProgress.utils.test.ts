import { describe, expect, it } from "vitest"
import { advanceProgress, finishProgress, startProgress, type JobProgress } from "@/jobs/progress"
import { buildSteps, elapsedText, estimateBuild, summaryText, timeLeftText } from "./BuildProgress.utils"

const stages = [
  "resolve-prompts",
  "structure",
  "analyze",
  "vocabulary",
  "plan",
  "encode",
  "verify",
  "repair",
  "merge",
  "consolidate",
  "save-draft"
].map((stage) => ({ stage, isOptional: stage === "repair" }))

const start = Date.parse("2026-10-09T12:00:00.000Z")
const at = (minutes: number) => new Date(start + minutes * 60_000).toISOString()

/** A build that has reported each of `reports` at its minute. */
function progressOf(reports: [stage: string, done: number, total: number, minute: number][]) {
  return reports.reduce<JobProgress>(
    (progress, [stage, done, total, minute]) => advanceProgress(progress, { stage, done, total }, at(minute)),
    startProgress(stages, { concurrency: 16, documents: 2 })
  )
}

const job = (progress: JobProgress) => ({ createdAt: at(0), progress })

describe("buildSteps", () => {
  it("shows every step up front in plain words, done, current or upcoming, with the current one's count", () => {
    const steps = buildSteps(
      progressOf([
        ["structure", 0, 2, 0],
        ["vocabulary", 0, 2, 1],
        ["encode", 47, 64, 9]
      ])
    )
    expect(steps.map((step) => [step.label, step.status])).toEqual([
      ["Reading documents", "done"],
      ["Finding defined terms", "done"],
      ["Drafting rules", "current"],
      ["Checking drafts", "upcoming"],
      ["Fixing problems", "upcoming"],
      ["Combining and checking for conflicts", "upcoming"],
      ["Saving the draft", "upcoming"]
    ])
    expect(steps[2]?.count).toBe("47 of 64 sections")
    expect(steps[4]).toMatchObject({ isOptional: true, count: null })
  })

  it("skips the second repair round visibly when nothing needs it", () => {
    const steps = buildSteps(
      progressOf([
        ["encode", 64, 64, 9],
        ["verify", 0, 1, 30],
        ["repair", 0, 0, 31],
        ["merge", 0, 1, 31]
      ])
    )
    expect(steps.find((step) => step.label === "Fixing problems")?.status).toBe("skipped")
    expect(steps.find((step) => step.label === "Drafting rules")).toMatchObject({
      status: "done",
      count: "64 of 64 sections"
    })
  })
})

describe("estimateBuild", () => {
  it("waits for the plan to know how many sections there are", () => {
    const estimate = estimateBuild(job(progressOf([["vocabulary", 0, 2, 1]])), start + 2 * 60_000)
    expect(estimate.remaining).toBeNull()
    expect(timeLeftText(estimate.remaining)).toBe("Working out how long this takes")
  })

  it("starts from the plan, then follows the build's own pace", () => {
    const planned = estimateBuild(job(progressOf([["encode", 0, 64, 6]])), start + 6 * 60_000)
    // 64 sections, 1.3 to 1.8 calls each, 16 at a time, 3 to 5 minutes a call, then repair and consolidation.
    expect(planned.remaining?.low).toBeGreaterThan(15)
    expect(planned.remaining?.high).toBeLessThan(90)

    // Half the sections in 10 minutes: drafting has about 10 minutes left at that pace.
    const halfway = estimateBuild(job(progressOf([["encode", 32, 64, 6]])), start + 16 * 60_000)
    expect(halfway.remaining?.low).toBeGreaterThanOrEqual(8)
    expect(halfway.remaining?.high).toBeLessThan(planned.remaining?.high ?? 0)

    // A slower pace makes the later model stages longer too.
    const slow = estimateBuild(job(progressOf([["encode", 8, 64, 6]])), start + 26 * 60_000)
    expect(slow.remaining?.low).toBeGreaterThan(halfway.remaining?.low ?? 0)
  })

  it("never reads complete before the build ends, even with nothing left but saving", () => {
    const saving = progressOf([
      ["encode", 64, 64, 6],
      ["save-draft", 0, 1, 40]
    ])
    const late = estimateBuild(job(saving), start + 300 * 60_000)
    expect(late.fraction).toBeLessThanOrEqual(0.95)
    expect(estimateBuild(job(finishProgress(saving, at(41))), start + 41 * 60_000).fraction).toBeLessThanOrEqual(0.95)
    expect(estimateBuild(job(progressOf([])), start).fraction).toBe(0)
  })
})

describe("text", () => {
  it("says the time left as a rounded range, the time so far, and the build in one line", () => {
    expect(timeLeftText({ low: 33, high: 48 })).toBe("About 30–50 minutes left")
    expect(timeLeftText({ low: 3.2, high: 6.1 })).toBe("About 3–7 minutes left")
    expect(timeLeftText({ low: 0.2, high: 1.5 })).toBe("About a minute or two left")
    expect(elapsedText(0.4)).toBe("Started just now")
    expect(elapsedText(12.7)).toBe("12 minutes so far")
    expect(elapsedText(65)).toBe("1 hour 5 minutes so far")
    const steps = buildSteps(progressOf([["encode", 47, 64, 9]]))
    expect(summaryText(steps, { low: 35, high: 50 })).toBe("Drafting rules, step 3 of 7, about 35–50 minutes left")
  })
})
