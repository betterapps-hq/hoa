import type { Job, JobFailure } from "@/jobs/job"
import type { RulebookRecords } from "@/rulebook/assemble"
import { coverageOf } from "@/rulebook/coverage"

// What the rules page says about a rulebook as a whole: its counts, and why the last build had problems.

/** Why the latest build failed; null when it finished. What a finished build skipped shows with its draft instead. */
export function describeBuildProblem(job: Job | null) {
  return job?.status === "failed" ? (job.error?.message ?? "Processing failed.") : null
}

/**
 * What the build that made this draft skipped; empty for a clean build, and for a build whose draft is gone (discarded
 * or replaced), since its skipped items went with it.
 */
export function buildFailuresOf(job: Job | null, rulebookId: string | null): JobFailure[] {
  return job?.status === "completed-with-errors" && job.subjectId === rulebookId ? job.failures : []
}

export type RulebookCounts = {
  rules: number
  terms: number
  questions: number
  uncovered: number
  withIssues: number
  approved: number
}

export function rulebookCounts(records: RulebookRecords): RulebookCounts {
  const reviewable = [...records.rules, ...records.terms]
  return {
    rules: records.rules.length,
    terms: records.terms.length,
    questions: records.questions.length,
    uncovered: coverageOf(records).uncovered.length,
    withIssues: reviewable.filter((record) => record.issues.some((issue) => issue.resolution === null)).length,
    approved: reviewable.filter((record) => record.review.status === "approved").length
  }
}
