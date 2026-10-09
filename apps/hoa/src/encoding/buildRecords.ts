import type { RulebookContent } from "@/db/rulebookContentRepository"
import { carryForward, type ReviewedRulebook } from "@/rulebook/carryForward"
import { buildSettings } from "@/schema/defaultSettings"
import type { Issue, IssueCode, Provenance, Review, Rule, Term } from "@/schema/types"
import { pathText } from "./promptVariables"
import type { ConsolidateOutput, MergeOutput } from "./stepOutputs"

// Save draft's records (encoding.md, Save draft): the consolidated rulebook's rules, terms and questions as proposed
// records with their issues, the settings over the defaults, and the review of earlier rulebooks (the current draft,
// then the published one) carried forward to records that didn't change.

/** An item a build couldn't finish, recorded on the job (platform.md, Errors and retries). */
export type BuildFailure = { stage: string; itemId: string; message: string }

const proposed: Review = { status: "proposed", by: null, at: null, note: null }

const consolidationCodes: Record<ConsolidateOutput["problems"][number]["code"], IssueCode> = {
  "undefined-rule": "undefined-rule",
  "undefined-term": "undefined-term",
  "override-not-allowed": "override-not-allowed",
  "invalid-override": "invariant"
}

/** Every problem the build left, by the key of the record it belongs to. */
function issuesByRecord(merged: MergeOutput, consolidated: ConsolidateOutput) {
  const byRecord = new Map<string, Issue[]>()
  const add = (recordKey: string, code: IssueCode, message: string, related: string[] = []) =>
    byRecord.set(recordKey, [...(byRecord.get(recordKey) ?? []), { code, message, related, resolution: null }])
  for (const issue of consolidated.issues) {
    const where = pathText(issue.path)
    add(issue.recordKey, issue.code, where ? `${where}: ${issue.message}` : issue.message)
  }
  for (const conflict of merged.conflicts) {
    add(conflict.recordKey, "conflict", conflict.message, conflict.related)
  }
  for (const problem of consolidated.problems) {
    add(problem.recordKey, consolidationCodes[problem.code], problem.message)
  }
  return byRecord
}

/** The draft rulebook's records, proposed, with the review of unchanged records in earlier rulebooks. */
export async function draftContent(input: {
  merged: MergeOutput
  consolidated: ConsolidateOutput
  now: string
  /** Earlier rulebooks, the one whose review decides first first. */
  previous: readonly ReviewedRulebook[]
}): Promise<RulebookContent> {
  const { rulebook } = input.consolidated
  const provenance: Provenance = { by: "extraction", at: input.now }
  const issues = issuesByRecord(input.merged, input.consolidated)
  const issuesOf = (key: string) => issues.get(key) ?? []
  const rules: Rule[] = rulebook.rules.map((rule) => ({
    ...rule,
    provenance,
    review: proposed,
    issues: issuesOf(rule.key)
  }))
  const terms: Term[] = rulebook.terms.map((term) => ({
    ...term,
    labels: term.labels.map((label) => ({ ...label, provenance })),
    provenance,
    review: proposed,
    issues: issuesOf(term.key)
  }))
  const carried = await carryForward(
    {
      rules,
      terms,
      settings: buildSettings(rulebook.settings.clauses, issuesOf("settings")),
      questions: rulebook.questions
    },
    input.previous
  )
  return { ...carried, coverage: input.merged.coverage }
}
