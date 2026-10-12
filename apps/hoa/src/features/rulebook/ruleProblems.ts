import type { RulebookRecords } from "@/rulebook/assemble"
import { isBlocking, reviewIssues } from "@/rulebook/review"
import type * as T from "@/schema/types"
import { ruleDraft, type RuleContent } from "@/schema/zod"

// What's wrong with an edited rule, as the editors show it while the administrator types: the schema's Zod first, then
// validateRulebook over the draft with the edit in it (encoding.md, UX, Editing).

export type Problem = { path: string; message: string; isBlocking: boolean }

const pathText = (path: readonly PropertyKey[]) => path.map(String).join(".")

/** The edit as a draft when the schema accepts it, and every problem found with it. */
export function ruleProblems(records: RulebookRecords, original: T.Rule, candidate: unknown) {
  const parsed = ruleDraft.safeParse(candidate)
  if (!parsed.success) {
    return {
      draft: null,
      problems: parsed.error.issues.map((issue) => ({
        path: pathText(issue.path),
        message: issue.message,
        isBlocking: true
      }))
    }
  }
  if (parsed.data.key !== original.key) {
    return {
      draft: null,
      problems: [{ path: "key", message: `A rule's key can't change; it stays ${original.key}.`, isBlocking: true }]
    }
  }
  const edited: T.Rule = {
    ...parsed.data,
    provenance: original.provenance,
    review: original.review,
    issues: original.issues
  }
  const found = reviewIssues({
    ...records,
    rules: records.rules.map((rule) => (rule.key === original.key ? edited : rule))
  }).get(original.key)
  return {
    draft: parsed.data,
    problems: (found ?? []).map((issue) => ({
      path: pathText(issue.path),
      message: issue.message,
      isBlocking: isBlocking(issue.code)
    }))
  }
}

/** A stored rule as the editors start from it: without what code fills. */
export function draftOf(rule: T.Rule): RuleContent {
  const { provenance: _provenance, review: _review, issues: _issues, ...content } = rule
  return content
}
