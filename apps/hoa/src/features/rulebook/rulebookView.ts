import type { Job } from "@/jobs/job"
import type { RulebookRecords } from "@/rulebook/assemble"
import { coverageOf } from "@/rulebook/coverage"

// What the rules page says about a rulebook as a whole: its counts, and why the last build had problems.

/** Why the latest build failed or skipped items; null for a clean one. */
export function describeBuildProblem(job: Job | null) {
  if (job?.status === "failed") {
    return job.error?.message ?? "The build failed."
  }
  const [first] = job?.failures ?? []
  if (job?.status === "completed-with-errors" && first) {
    return `${job.failures.length === 1 ? "1 item" : `${job.failures.length} items`} failed (${first.stage}): ${first.message}`
  }
  return null
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
