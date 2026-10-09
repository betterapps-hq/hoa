import type { RulebookContent } from "@/db/rulebookContentRepository"
import type { Job } from "@/jobs/job"
import { renderStatement } from "@/schema/statement"
import type { Rule } from "@/schema/types"
import { createVocabulary } from "@/schema/vocabulary"

// What the rules page shows of a rulebook's records until the rules UX (implementation-plan.md, phase 5) replaces it:
// counts, the rules with their statements in words, and why the last build had problems.

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

export function rulebookCounts(content: RulebookContent): RulebookCounts {
  const records = [...content.rules, ...content.terms]
  return {
    rules: content.rules.length,
    terms: content.terms.length,
    questions: content.questions.length,
    uncovered: content.coverage.uncovered.length,
    withIssues: records.filter((record) => record.issues.some((issue) => issue.resolution === null)).length,
    approved: records.filter((record) => record.review.status === "approved").length
  }
}

export type RuleLine = { key: string; title: string; statement: string; kind: Rule["kind"]; status: string }

/** Each rule as a line: its statement with term links read as the terms' labels. */
export function ruleLines(content: Pick<RulebookContent, "rules" | "terms">): RuleLine[] {
  const vocabulary = createVocabulary(content.terms)
  return content.rules
    .map((rule) => ({
      key: rule.key,
      title: rule.title,
      statement: renderStatement(rule.statement, (key, plural) => vocabulary.label(key, plural)),
      kind: rule.kind,
      status: rule.review.status
    }))
    .toSorted((a, b) => a.key.localeCompare(b.key))
}

/** The published rules: those approved. */
export function approvedRuleLines(content: Pick<RulebookContent, "rules" | "terms">) {
  return ruleLines({ ...content, rules: content.rules.filter((rule) => rule.review.status === "approved") })
}
