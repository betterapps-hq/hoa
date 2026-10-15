import { match, P } from "ts-pattern"
import { evaluate } from "@/engine/evaluate"
import type { RulebookRecords } from "@/rulebook/assemble"
import type * as T from "@/schema/types"
import type { Vocabulary } from "@/schema/vocabulary"
import type { TermContent } from "@/schema/zod"

// Previewing a rule against facts an administrator types (implementation-plan.md, 5.15): the facts its applicability
// and check read about the subject, the request, the lot and the community, evaluated by the engine.

type Property = Extract<TermContent, { kind: "property" }>

/** A fact the preview asks for: a property of the subject or of the request, its lot or the community. */
export type PreviewInput = { id: string; root: T.Root; property: Property }

const typable = new Set(["quantity", "count", "boolean", "choice", "date", "date-time", "time-of-day", "text", "party"])

function pathsIn(value: unknown, found: T.Path[]) {
  if (Array.isArray(value)) {
    value.forEach((item) => pathsIn(item, found))
  } else if (typeof value === "object" && value !== null) {
    const record: Record<string, unknown> = { ...value }
    const { path, from } = record
    if (Array.isArray(path) && path.every((step) => typeof step === "string")) {
      const root = match(from)
        .with(P.union("subject", "request", "lot", "community"), (named) => named)
        .otherwise(() => undefined)
      found.push(root ? { from: root, path } : { path })
    }
    Object.values(record).forEach((item) => pathsIn(item, found))
  }
  return found
}

/**
 * The facts a rule reads that can be typed, and what it reads that can't. The rules that override it are read too,
 * since whether they apply decides whether it does.
 */
export function previewInputs(rule: T.Rule, vocabulary: Vocabulary, overriders: T.Rule[] = []) {
  const check = rule.kind === "norm" ? rule.check : null
  const inputs = new Map<string, PreviewInput>()
  let hasRelated = false
  for (const path of pathsIn([rule.appliesWhen, check, ...overriders.map((item) => item.appliesWhen)], [])) {
    const root = path.from ?? "subject"
    const [first, ...rest] = path.path
    const property = vocabulary.get(first ?? "")
    if (property?.kind !== "property") {
      continue
    }
    if (rest.length > 0 || property.many || !typable.has(property.valueType.type)) {
      hasRelated = true
      continue
    }
    inputs.set(`${root} ${property.key}`, { id: `${root} ${property.key}`, root, property })
  }
  const untypable = [
    ...(hasRelated ? ["facts about related things or lists"] : []),
    ...(check && ["document", "approval", "judgment"].includes(check.type) ? [`the ${check.type} its check needs`] : [])
  ]
  return { inputs: [...inputs.values()], untypable }
}

/** A typed fact's value, or null when nothing usable is typed. */
export function factValue(property: Property, text: string, vocabulary: Vocabulary): T.FactValue | null {
  if (text.trim() === "") {
    return null
  }
  const number = Number(text)
  return match(property.valueType)
    .returnType<T.FactValue | null>()
    .with({ type: "quantity" }, ({ unit }) => (Number.isNaN(number) ? null : { type: "quantity", value: number, unit }))
    .with({ type: "count" }, () => (Number.isNaN(number) ? null : { type: "number", value: number }))
    .with({ type: "boolean" }, () => ({ type: "boolean", value: text === "yes" }))
    .with({ type: P.union("choice", "party") }, () => ({ type: "value", term: text, text: vocabulary.label(text) }))
    .with({ type: "date" }, () => ({ type: "date", value: text }))
    .with({ type: "date-time" }, () => ({ type: "date-time", value: `${text}:00Z` }))
    .with({ type: "time-of-day" }, () => ({ type: "time", value: text }))
    .with({ type: "text" }, () => ({ type: "text", value: text }))
    .otherwise(() => null)
}

/** Whether the engine evaluates the rule on its own: norms that aren't permissions, about a named kind of thing. */
export const isPreviewable = (rule: T.Rule) =>
  rule.kind === "norm" && rule.modality !== "permission" && rule.appliesTo !== null

/** Evaluates the rule on one subject with the typed facts; gives its findings, or why it couldn't. */
export function previewRule(
  records: RulebookRecords,
  rule: T.Rule,
  input: { requestType: T.TermKey; asOf: T.IsoDate; facts: { root: T.Root; property: T.TermKey; value: T.FactValue }[] }
) {
  const isLive = (record: { review: T.Review }) => record.review.status !== "rejected"
  const terms = records.terms.filter(isLive)
  const rules = records.rules.filter(isLive).map((item) => (item.key === rule.key ? rule : item))
  // The preview tries the rule on one subject: the first it applies to.
  const subjectType = rule.appliesTo[0] ?? ""
  // The subject is the lot, the community or the request itself when the rule is about one of them.
  const subjectId = match(subjectType)
    .with("lot", "community", (root) => root)
    .with(input.requestType, () => "request")
    .otherwise(() => "subject")
  const entityOf = (root: T.Root) => (root === "subject" ? subjectId : root)
  const request: T.EvaluationRequest = {
    organizationId: records.organization.id,
    type: input.requestType,
    governingDate: input.asOf,
    evaluationDate: input.asOf,
    lot: "lot",
    entities: [
      { id: "request", type: input.requestType, label: "The request", ref: null },
      { id: "lot", type: "lot", label: "The lot", ref: null },
      { id: "community", type: "community", label: "The community", ref: null },
      ...(subjectId === "subject" ? [{ id: "subject", type: subjectType, label: "The subject", ref: null }] : [])
    ],
    facts: input.facts.map((fact) => ({
      entity: entityOf(fact.root),
      property: fact.property,
      state: "known",
      value: fact.value,
      candidates: [],
      complete: null,
      stated: null,
      evidence: [],
      confidence: 1,
      provenance: { by: "system", at: `${input.asOf}T00:00:00Z` }
    })),
    documents: []
  }
  const rulesFile: T.RulesFile = {
    organization: records.organization,
    documents: records.documents,
    provisions: records.provisions,
    terms: terms.filter((term) => term.organizationId !== null),
    proposedCore: terms.filter((term) => term.organizationId === null),
    rules,
    settings: records.settings,
    questions: []
  }
  try {
    const findings = evaluate({ rulesFile, request, evaluatedAt: `${input.asOf}T12:00:00Z` })
    return { findings: findings.filter((finding) => finding.ruleKey === rule.key), error: null }
  } catch (error) {
    return { findings: [], error: error instanceof Error ? error.message : "The rule couldn't be evaluated." }
  }
}

export const outcomeLabels: Record<T.Outcome, string> = {
  met: "Met",
  "not-met": "Not met",
  advisory: "Advisory",
  "missing-information": "Missing information",
  committee: "Goes to the committee",
  pending: "Pending",
  exempt: "Exempt",
  "not-applicable": "Doesn’t apply",
  available: "Available",
  blocked: "Blocked"
}
