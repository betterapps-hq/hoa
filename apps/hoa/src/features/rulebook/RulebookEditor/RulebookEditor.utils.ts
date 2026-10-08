import { z } from "zod"
import { ruleSchema, type Rule } from "@/rules/rules"

export const decisions = ["pending", "approved", "rejected"] as const
export type Decision = (typeof decisions)[number]

export const ruleDraftSchema = ruleSchema.extend({ decision: z.enum(decisions) })
export type RuleDraft = z.infer<typeof ruleDraftSchema>

export const editorSchema = z.object({ rules: z.array(ruleDraftSchema) })
export type EditorValues = z.infer<typeof editorSchema>

export function toDrafts(rules: Rule[]): RuleDraft[] {
  return rules.map((rule) => ({ ...rule, decision: "pending" }))
}

export function approvedRules(drafts: RuleDraft[]): Rule[] {
  return drafts.filter((draft) => draft.decision === "approved").map(({ decision: _decision, ...rule }) => rule)
}

export function countDecisions(drafts: { decision: Decision }[]) {
  return {
    pending: drafts.filter((draft) => draft.decision === "pending").length,
    approved: drafts.filter((draft) => draft.decision === "approved").length,
    rejected: drafts.filter((draft) => draft.decision === "rejected").length
  }
}

export function newRuleDraft(document: string): RuleDraft {
  return {
    id: `rule-${crypto.randomUUID()}`,
    title: "",
    requirement: "",
    kind: "allowed-values",
    projectTypes: ["fence"],
    source: { document, section: "", page: null, quote: "" },
    decision: "approved"
  }
}
