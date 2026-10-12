import { projectRules } from "@/projectTypes/build"
import { formKindOf } from "@/review/documents"
import { rulebookVocabulary } from "@/review/documentTypes"
import { renderStatement } from "@/schema/statement"
import type * as T from "@/schema/types"
import { reportRules, type ReportRule } from "../applications/applicationView"

// Every requirement the rulebook places on a kind of project (application-review.md, Project types): the rules a
// review of a project of these subjects selects, grouped plainly by what they ask. Computed from the published
// rulebook each time, so it follows the rulebook.

export const requirementGroups = [
  { id: "allowed", title: "What's allowed" },
  { id: "limits", title: "Limits" },
  { id: "documents", title: "Documents to include" },
  { id: "approvals", title: "Who must approve" },
  { id: "committee", title: "Decided by the committee" },
  { id: "other", title: "Other requirements" }
] as const
export type RequirementGroupId = (typeof requirementGroups)[number]["id"]

/**
 * A rule as the requirements list shows it: its reference, its statement in the organization's words, and whether the
 * application form itself meets it (a document the form provides).
 */
export type RequirementRule = ReportRule & { isMetByForm: boolean }

export type RequirementGroup = { id: RequirementGroupId; title: string; rules: RequirementRule[] }

/** Whether a condition compares amounts anywhere (a limit), rather than naming allowed values. */
function comparesAmounts(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(comparesAmounts)
  }
  if (typeof value !== "object" || value === null) {
    return false
  }
  const isComparison = "op" in value && typeof value.op === "string" && /[<>]/.test(value.op)
  return isComparison || Object.values(value).some(comparesAmounts)
}

function groupOf(rule: T.Rule): RequirementGroupId {
  if (rule.kind === "discretion") {
    return "committee"
  }
  if (rule.kind !== "norm" || !rule.check) {
    return "other"
  }
  switch (rule.check.type) {
    case "document":
      return "documents"
    case "approval":
      return "approvals"
    case "judgment":
      return "committee"
    case "table":
      return "allowed"
    case "test":
      return comparesAmounts(rule.check.test) ? "limits" : "allowed"
    default:
      return "other"
  }
}

/** The requirements for a project of these subjects, grouped; empty groups left out. */
export function projectRequirements(
  rulesFile: T.RulesFile,
  requestType: T.TermKey,
  subjects: readonly T.TermKey[],
  on: T.IsoDate
): RequirementGroup[] {
  const vocabulary = rulebookVocabulary(rulesFile)
  const selected = projectRules(rulesFile, requestType, subjects, on)
  const byKey = new Map(rulesFile.rules.map((rule) => [rule.key, rule]))
  const text = (statement: string) => renderStatement(statement, (key, plural) => vocabulary.label(key, plural))
  const isMetByForm = (key: T.RuleKey) => {
    const rule = byKey.get(key)
    return rule?.kind === "norm" && rule.check?.type === "document" && formKindOf(rule.check, vocabulary) !== null
  }
  const rules = reportRules(rulesFile, selected).map((rule) => ({
    ...rule,
    statement: text(rule.statement),
    isMetByForm: isMetByForm(rule.key)
  }))
  return requirementGroups.flatMap((group) => {
    const members = rules.filter((rule) => {
      const found = byKey.get(rule.key)
      return found !== undefined && groupOf(found) === group.id
    })
    return members.length > 0 ? [{ id: group.id, title: group.title, rules: members }] : []
  })
}
