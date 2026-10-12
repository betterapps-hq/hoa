import type * as T from "@/schema/types"

// How the rules UX names the schema's enumerations.

export const domains: T.Domain[] = [
  "architectural",
  "use",
  "maintenance",
  "financial",
  "governance",
  "enforcement",
  "general"
]

export const ruleKinds: T.Rule["kind"][] = ["norm", "discretion", "sanction", "limit"]

export const domainLabels: Record<T.Domain, string> = {
  architectural: "Architectural",
  use: "Use",
  maintenance: "Maintenance",
  financial: "Financial",
  governance: "Governance",
  enforcement: "Enforcement",
  general: "General"
}

export const ruleKindLabels: Record<T.Rule["kind"], string> = {
  norm: "Norm",
  discretion: "Discretion",
  sanction: "Sanction",
  limit: "Limit"
}

export const modalityLabels: Record<T.NormRule["modality"], string> = {
  obligation: "Must (an obligation)",
  prohibition: "Prohibited outright",
  permission: "May (a permission)",
  recommendation: "Should (a recommendation)",
  requirement: "Needed to take effect (a requirement)"
}

export const remedyLabels: Record<T.RuleRemedy, string> = {
  "change-detail": "Change a detail",
  redesign: "Redesign",
  none: "Nothing fixes it"
}

export const reviewLabels: Record<T.Review["status"], string> = {
  proposed: "To review",
  approved: "Approved",
  rejected: "Rejected"
}

export const noRuleReasonLabels: Record<T.NoRule["reason"], string> = {
  heading: "Only a heading",
  recital: "A recital, background only",
  reserved: "Reserved, no text in force",
  explanatory: "Explains, requires nothing",
  duplicate: "Repeats another provision"
}

/** "Only a heading. Its text is in its paragraphs.": why a provision has no rule, in words, with its note. */
export const noRuleText = ({ reason, note }: Pick<T.NoRule, "reason" | "note">) =>
  note ? `${noRuleReasonLabels[reason]}. ${note}` : noRuleReasonLabels[reason]
