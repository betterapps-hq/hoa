import { match } from "ts-pattern"
import type * as T from "@/schema/types"
import { approvalOf, compareValues, evaluateCondition, isAmong } from "./conditions"
import type { Context, Scope } from "./context"
import { evaluateDeadline } from "./deadlines"
import { evaluateOperand } from "./operands"
import * as V from "./values"

// Checks (schema.md, Checks; Evaluating a request 5): whether a subject complies, fails, can't be told yet, waits on
// a deadline, or waits on the body deciding the application.

export type CheckStatus = "complies" | "fails" | "unknown" | "pending" | "awaiting-decision"

export type CheckResult = {
  status: CheckStatus
  judgment: T.Finding["judgment"]
  statements: T.Finding["statements"]
  effects: T.Finding["effects"]
  /** What a document check found missing: the document, or a party's signature. */
  missing: string[]
}

const result = (status: CheckStatus, details: Partial<Omit<CheckResult, "status">> = {}): CheckResult => ({
  status,
  judgment: null,
  statements: [],
  effects: [],
  missing: [],
  ...details
})

function fromTruth(truth: V.Truth) {
  if (truth === null) {
    return result("unknown")
  }
  return result(truth ? "complies" : "fails")
}

type Table = Extract<T.Check, { type: "table" }>
type DocumentCheck = Extract<T.Check, { type: "document" }>

// A row matches when every cell does; rows never overlap. Some unknown rows still decide the result when every result
// they could give is the same.
function table(context: Context, scope: Scope, check: Table) {
  const inputs = check.inputs.map((input) => evaluateOperand(context, scope, input))
  const cellMatches = (cell: T.Cell, input: V.Evaluated) =>
    match(cell)
      .returnType<V.Truth>()
      .with({ type: "any" }, () => true)
      .with({ type: "in" }, ({ values }) =>
        isAmong(
          context,
          input,
          values.map((value) => evaluateOperand(context, scope, value))
        )
      )
      .with({ type: "not-in" }, ({ values }) =>
        V.not(
          isAmong(
            context,
            input,
            values.map((value) => evaluateOperand(context, scope, value))
          )
        )
      )
      .with({ type: "range" }, (range) =>
        V.all([
          range.min
            ? compareValues(context, input, range.includeMin ? ">=" : ">", evaluateOperand(context, scope, range.min))
            : true,
          range.max
            ? compareValues(context, input, range.includeMax ? "<=" : "<", evaluateOperand(context, scope, range.max))
            : true
        ])
      )
      .exhaustive()
  const rows = check.rows.map((row) => ({
    result: row.result,
    matches: V.all(row.when.map((cell, i) => cellMatches(cell, inputs[i] ?? V.unknown)))
  }))
  const matched = rows.find((row) => row.matches === true)
  if (matched) {
    return result(matched.result === "met" ? "complies" : "fails")
  }
  const possible = new Set([check.otherwise, ...rows.filter((row) => row.matches === null).map((row) => row.result)])
  if (possible.size > 1) {
    return result("unknown")
  }
  return result(check.otherwise === "met" ? "complies" : "fails")
}

// A document of the type for the request, or for this subject; each statement confirmed by the document reader; and
// every party to sign: each one of them for the request, or one for a subject (the neighbor beside this run).
function documentCheck(context: Context, ruleKey: T.RuleKey, subject: string, check: DocumentCheck) {
  const { vocabulary, request, answers } = context
  const documents = request.documents.filter(
    (document) =>
      vocabulary.isKindOf(document.type, check.document) &&
      (check.per === "request" || document.subjects.includes(subject))
  )
  if (documents.length === 0) {
    return result("unknown", { missing: [vocabulary.label(check.document)] })
  }
  const review = answers.documentReviews.find((found) => found.ruleKey === ruleKey && found.entity === subject)
  const statements = check.mustState.map(
    (statement) =>
      review?.statements.find((found) => found.statement === statement) ?? { statement, confirmed: null, quote: null }
  )
  const signers = new Set(documents.flatMap((document) => document.signedBy))
  const unsigned = check.signedBy.filter((party) => {
    const parties = request.entities.filter((entity) => entity.type === party)
    const isSigned = (entity: { id: string }) => signers.has(entity.id)
    return check.per === "request" ? parties.length === 0 || !parties.every(isSigned) : !parties.some(isSigned)
  })
  const missing = unsigned.map((party) => `a signature from the ${vocabulary.label(party)}`)
  if (statements.some((statement) => statement.confirmed === false)) {
    return result("fails", { statements, missing })
  }
  const isUnconfirmed = statements.some((statement) => statement.confirmed === null)
  return result(isUnconfirmed || missing.length > 0 ? "unknown" : "complies", { statements, missing })
}

// A judgment decides the check only at or above the organization's judgment confidence threshold.
function judgment(context: Context, ruleKey: T.RuleKey, subject: string) {
  const found = context.answers.judgments.find((answer) => answer.ruleKey === ruleKey && answer.entity === subject)
  if (!found) {
    return result("unknown")
  }
  const { answer, confidence, rationale, evidence } = found
  const details = { judgment: { answer, confidence, rationale, evidence } }
  const isConfident = confidence >= context.settings.policy.thresholds.judgmentConfidence
  if (!isConfident || answer === "unclear") {
    return result("unknown", details)
  }
  return result(answer === "yes" ? "complies" : "fails", details)
}

// Satisfied complies; impossible fails; otherwise the body is about to decide in an application, and it fails elsewhere.
function approval(context: Context, subject: string, check: Extract<T.Check, { type: "approval" }>) {
  const state = approvalOf(context, subject, check)
  if (state.satisfied === true) {
    return result("complies")
  }
  if (state.impossible === true) {
    return result("fails")
  }
  if (state.satisfied === null || state.impossible === null) {
    return result("unknown")
  }
  return result(context.flow === "application" ? "awaiting-decision" : "fails")
}

/** Evaluates a rule's check on a subject entity; no check is an outright prohibition, which fails. */
export function evaluateCheck(
  context: Context,
  ruleKey: T.RuleKey,
  subject: string,
  check: T.Check | null
): CheckResult {
  if (!check) {
    return result("fails")
  }
  const scope: Scope = { subject: { type: "entity", id: subject } }
  return match(check)
    .returnType<CheckResult>()
    .with({ type: "test" }, ({ test }) => fromTruth(evaluateCondition(context, scope, test)))
    .with({ type: "table" }, (tableCheck) => table(context, scope, tableCheck))
    .with({ type: "document" }, (document) => documentCheck(context, ruleKey, subject, document))
    .with({ type: "deadline" }, (deadline) => {
      const { status, effects } = evaluateDeadline(context, scope, deadline)
      return result(status, { effects })
    })
    .with({ type: "judgment" }, () => judgment(context, ruleKey, subject))
    .with({ type: "approval" }, (approvalCheck) => approval(context, subject, approvalCheck))
    .exhaustive()
}
