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
  heading: "A heading",
  recital: "A recital",
  reserved: "Reserved",
  explanatory: "Explains, requires nothing",
  duplicate: "Says what another provision says",
  "not-evaluated": "Not evaluated yet"
}
