import type * as T from "@/schema/types"
import { ruleDraft, type RuleContent } from "@/schema/zod"
import { domainLabels, domains, modalityLabels, remedyLabels } from "../ruleLabels"

// Choices and field errors for the rule form.

const remedyChoiceLabels: Record<T.RuleRemedy | "no-remedy", string> = {
  ...remedyLabels,
  "no-remedy": "No remedy: it doesn't bind an applicant"
}

const choices = <V extends string>(values: readonly V[], labels: Record<V, string>) =>
  values.map((value) => ({ value, label: labels[value] }))

export const domainChoices = choices(domains, domainLabels)
export const modalityChoices = choices(
  ["obligation", "prohibition", "permission", "recommendation", "requirement"],
  modalityLabels
)
export const remedyChoices = choices(["change-detail", "redesign", "none", "no-remedy"], remedyChoiceLabels)

export const needsCheck = (modality: T.NormRule["modality"]) =>
  modality === "obligation" || modality === "recommendation" || modality === "requirement"

/** The fields the form edits directly; the applicability and the check have their own editors. */
export type RuleFields = {
  title: string
  statement: string
  domain: T.Domain
  requestTypes: string[]
  appliesTo: string[]
  modality: T.NormRule["modality"]
  bearer: string[]
  remedy: T.RuleRemedy | null
  decidedBy: string[]
}

/** The structured parts of a rule, edited beside the fields. */
export type RuleStructure = { appliesWhen: T.Condition | null; check: T.Check | null }

export function fieldsOf(rule: RuleContent): RuleFields {
  const norm = rule.kind === "norm" ? rule : null
  return {
    title: rule.title,
    statement: rule.statement,
    domain: rule.domain,
    requestTypes: rule.requestTypes,
    appliesTo: rule.appliesTo,
    modality: norm?.modality ?? "obligation",
    bearer: norm?.bearer ?? [],
    remedy: norm?.remedy ?? null,
    decidedBy: norm?.decidedBy ?? []
  }
}

/** The rule with the form's fields and structure in it; a norm's own fields only go on a norm. */
export function withFields(rule: RuleContent, fields: RuleFields, structure: RuleStructure): RuleContent {
  const common = {
    title: fields.title,
    statement: fields.statement,
    domain: fields.domain,
    requestTypes: fields.requestTypes,
    appliesTo: fields.appliesTo,
    appliesWhen: structure.appliesWhen
  }
  if (rule.kind !== "norm") {
    return { ...rule, ...common }
  }
  const { modality, bearer, remedy, decidedBy } = fields
  return { ...rule, ...common, modality, bearer, remedy, decidedBy, check: structure.check }
}

/** The schema's problems with an edited rule, by the form field they're on; the first one per field. */
export function fieldErrors(rule: RuleContent) {
  const result = ruleDraft.safeParse(rule)
  if (result.success) {
    return undefined
  }
  const fields: Partial<Record<keyof RuleFields, { message: string }>> = {}
  for (const issue of result.error.issues) {
    const field = fieldNames.find((name) => name === issue.path[0])
    if (field && !fields[field]) {
      fields[field] = { message: issue.code === "too_small" ? (emptyMessages[field] ?? issue.message) : issue.message }
    }
  }
  return { fields }
}

const emptyMessages: Partial<Record<keyof RuleFields, string>> = {
  title: "Give the rule a title.",
  statement: "State the rule.",
  requestTypes: "Choose at least one request type."
}

const fieldNames: (keyof RuleFields)[] = [
  "title",
  "statement",
  "domain",
  "requestTypes",
  "appliesTo",
  "modality",
  "bearer",
  "remedy",
  "decidedBy"
]
