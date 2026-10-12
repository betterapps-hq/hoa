import { z } from "zod"

// A job's steps, recorded as it runs (encoding.md, UX, The build's progress): every stage the job will report, in
// order, each upcoming, current, done or skipped, with its count and its start and end times. The job writes the list
// when it starts, so the page shows the whole job up front, and each progress report moves it forward. Times feed the
// page's estimate of what's left.

export const jobStepStatus = z.enum(["upcoming", "current", "done", "skipped"])

export const jobStep = z.object({
  /** The stage id the job reports (`structure`, `find-rules`, ...). */
  stage: z.string(),
  status: jobStepStatus,
  /** A stage that may have nothing to do, such as merging the vocabulary: skipped when it has nothing. */
  isOptional: z.boolean(),
  done: z.number().int(),
  total: z.number().int(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable()
})
export type JobStep = z.infer<typeof jobStep>

/** What the job will work through, for the estimate: model calls in flight at once and the documents it reads. */
export const jobWorkload = z.object({ concurrency: z.number().int().positive(), documents: z.number().int() })

export const jobProgress = z.object({ steps: z.array(jobStep), workload: jobWorkload })
export type JobProgress = z.infer<typeof jobProgress>

/** A job's steps before it starts: every stage upcoming. */
export function startProgress(
  stages: readonly { stage: string; isOptional?: boolean }[],
  workload: JobProgress["workload"]
): JobProgress {
  return {
    steps: stages.map(({ stage, isOptional = false }) => ({
      stage,
      status: "upcoming",
      isOptional,
      done: 0,
      total: 0,
      startedAt: null,
      finishedAt: null
    })),
    workload
  }
}

/** A step left behind: done, or skipped when it never started or is optional with nothing to do. */
function close(step: JobStep, now: string): JobStep {
  if (step.status === "done" || step.status === "skipped") {
    return step
  }
  const hasNothing = step.status === "upcoming" || (step.isOptional && step.total === 0)
  return { ...step, status: hasNothing ? "skipped" : "done", finishedAt: step.startedAt === null ? null : now }
}

/**
 * The steps once the job reports `stage` at `done` of `total`: the steps before it close, and it becomes current. A
 * stage the list doesn't have is added at the end. Counts only move forward, so reports that land out of order (steps
 * running in parallel) never take a count back.
 */
export function advanceProgress(
  progress: JobProgress,
  report: { stage: string; done: number; total: number },
  now: string
): JobProgress {
  const known = progress.steps.some((step) => step.stage === report.stage)
  const steps = known
    ? progress.steps
    : [
        ...progress.steps,
        {
          stage: report.stage,
          status: "upcoming" as const,
          isOptional: false,
          done: 0,
          total: 0,
          startedAt: null,
          finishedAt: null
        }
      ]
  const index = steps.findIndex((step) => step.stage === report.stage)
  return {
    ...progress,
    steps: steps.map((step, i) => {
      if (i < index) {
        return close(step, now)
      }
      if (i > index) {
        return step
      }
      const isSameRun = step.status === "current" && step.total === report.total
      return {
        ...step,
        status: "current",
        done: isSameRun ? Math.max(step.done, report.done) : report.done,
        total: report.total,
        startedAt: step.startedAt ?? now,
        finishedAt: null
      }
    })
  }
}

/** The steps once the job is stopped: the current step ends where it was, and the rest stay upcoming. */
export function stopProgress(progress: JobProgress, now: string): JobProgress {
  return {
    ...progress,
    steps: progress.steps.map((step) => (step.status === "current" ? { ...step, finishedAt: now } : step))
  }
}

/** The steps once the job ends: every step closed. */
export function finishProgress(progress: JobProgress, now: string): JobProgress {
  return { ...progress, steps: progress.steps.map((step) => close(step, now)) }
}
