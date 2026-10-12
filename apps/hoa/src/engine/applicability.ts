import type * as T from "@/schema/types"
import { evaluateCondition, isA } from "./conditions"
import type { Context } from "./context"
import * as V from "./values"

// Which rules a request considers and whether one applies to a subject (schema.md, Evaluating a request 1 to 3).

export const documentKeyOf = (provisionKey: T.ProvisionKey) => provisionKey.slice(0, provisionKey.indexOf(":"))

/** The rule's main citation's provision. */
export const mainProvision = (rule: T.Rule) => rule.citations[0]?.provisionKey ?? ""

/**
 * Rules in the request's type in force on its governing date. A decision rule applies to its scope from approval,
 * whatever the date, and only on that lot.
 */
export function isConsidered(context: Context, rule: T.Rule) {
  if (!rule.requestTypes.includes(context.request.type)) {
    return false
  }
  if (rule.scope) {
    return context.entities.get(context.rootId("lot"))?.ref === rule.scope.lotId
  }
  return rule.effectiveFrom <= context.request.governingDate
}

/** Whether a rule applies to a subject: its type, its document governing the lot, and its appliesWhen. */
export function appliesOn(
  context: Context,
  documents: Map<string, T.GoverningDocument>,
  rule: T.Rule,
  subject: string
): V.Truth {
  if (rule.scope?.subjectId && context.entities.get(subject)?.ref !== rule.scope.subjectId) {
    return false
  }
  const membership = rule.appliesTo ? isA(context, subject, rule.appliesTo) : true
  if (membership === false) {
    return false
  }
  const governs = documents.get(documentKeyOf(mainProvision(rule)))?.governs
  const lot = { subject: { type: "entity" as const, id: context.rootId("lot") } }
  return V.all([
    membership,
    governs ? evaluateCondition(context, lot, governs) : true,
    rule.appliesWhen ? evaluateCondition(context, { subject: { type: "entity", id: subject } }, rule.appliesWhen) : true
  ])
}
