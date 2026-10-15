import { match } from "ts-pattern"
import { describeCondition } from "@/schema/describe"
import type * as T from "@/schema/types"
import { documentKeyOf, isConsidered, mainProvision } from "./applicability"
import * as C from "./calendar"
import { evaluateCondition } from "./conditions"
import { type Context, createContext, type Input, type Resolved, type Scope } from "./context"
import * as D from "./decimal"
import { deriveProperty } from "./derived"
import { evaluateOperand } from "./operands"
import { resolvePath } from "./paths"
import type * as V from "./values"
import { createEngineVocabulary } from "./vocabulary"

// Sanctions and limits (schema.md, Deadlines, cure, sanctions and limits): for each rule found broken in a violation or
// an assessment, its cure period, and each sanction rule that enforces it: available with its amount, pending until it
// may be imposed, blocked by a limit, waiting on information, or not applicable. The board decides what to impose.

export type SanctionInput = {
  rulesFile: T.RulesFile
  request: T.EvaluationRequest
  /** The rules found broken: a violation's rules once the board finds them broken, an assessment's due date. */
  broken: T.RuleKey[]
  /**
   * Which occurrence a sanction counts this as, for the broken rule it enforces, by its `occurrences`; null when it
   * can't be told. The feature that keeps the violations counts them. Without it, the request's `violation.occurrence`
   * fact counts for every sanction.
   */
  occurrenceOf?: (rule: T.SanctionRule, enforced: T.RuleKey) => number | null
}

export type CureStatus =
  /** No cure period: the rule says none, it's about an event that's over, or nothing gives one. */
  | "none"
  /** The day it counts from hasn't come: no notice yet, say. */
  | "not-started"
  | "running"
  /** Cured within the period: the rules it enforces can't be sanctioned. */
  | "cured"
  | "passed"
  | "unknown"

export type CurePeriod = {
  ruleKey: T.RuleKey
  status: CureStatus
  reason: string
  startsOn: T.IsoDate | null
  /** The last day to cure, rolled past weekends and holidays when the settings say so. */
  endsOn: T.IsoDate | null
  curedOn: T.IsoDate | null
  citations: T.Citation[]
  /** What it needs to be told, by label. */
  needs: string[]
}

/** A sanction's amount in whole cents. */
export type SanctionAmount =
  | { type: "none" }
  | { type: "set-by-imposer"; maxEach: number | null; maxTotal: number | null }
  | {
      type: "fixed"
      /** This occurrence's amount, from the schedule. */
      each: number
      /** What it adds each period while uncured, and how many periods have run. */
      repeats: { every: T.Amount; each: number; periods: number } | null
      total: number
      /** The cap or limit that lowered the total, if one did. */
      cappedBy: T.RuleKey | null
    }
  | { type: "unknown"; needs: string[] }

export type SanctionOutcome = "available" | "pending" | "blocked" | "missing-information" | "not-applicable"

export type SanctionResult = {
  ruleKey: T.RuleKey
  /** The broken rule it enforces here. */
  enforced: T.RuleKey
  outcome: SanctionOutcome
  reason: string
  /** When it's pending on a day: the first day it may be imposed. */
  availableOn: T.IsoDate | null
  needs: string[]
  modality: T.SanctionRule["modality"]
  type: T.Sanction["type"]
  occurrence: number | null
  amount: SanctionAmount
  /** Who it's imposed on: its parties, and whoever answers for them. */
  against: T.TermKey[]
  imposedBy: T.TermKey
  suspends: T.TermKey[]
  lasts: T.Sanction["lasts"]
  /** The limits that cap or forbid it. */
  limitedBy: T.RuleKey[]
  /** When it waits on a procedure the settings require first (notice and hearing, say): that procedure's condition. */
  precondition: T.Condition | null
  inputs: Input[]
}

export type SanctionsResult = {
  cures: CurePeriod[]
  sanctions: SanctionResult[]
  /** Every fact the cure periods and sanctions read, for asking what's unknown. */
  reads: Input[]
}

const outcomeOrder: SanctionOutcome[] = ["available", "pending", "missing-information", "blocked", "not-applicable"]

const unknownLabels = (context: Context) => [
  ...new Set(
    context.reads
      .filter((read) => read.state !== "known" && read.state !== "absent" && read.state !== "derived")
      .map((read) => context.vocabulary.label(read.property))
  )
]

/** A date a path reaches: its day, none stated, or unknown. */
type DayOf = { state: "known"; day: number } | { state: "absent" } | { state: "unknown" }

function dayOf(resolved: Resolved): DayOf {
  if (resolved.state === "absent") {
    return { state: "absent" }
  }
  if (resolved.state !== "known" || resolved.value.type !== "date") {
    return { state: "unknown" }
  }
  const { min, max } = resolved.value.range
  if (min === null || max === null || D.compare(min, max) !== 0) {
    return { state: "unknown" }
  }
  return { state: "known", day: Number(D.floor(min)) }
}

/** An amount of money a value holds, in whole cents; undefined when it isn't one exact amount. */
function centsOf(evaluated: V.Evaluated): number | undefined {
  if (evaluated.kind !== "value" || evaluated.value.type !== "number") {
    return undefined
  }
  const { min, max } = evaluated.value.range
  if (min === null || max === null || D.compare(min, max) !== 0) {
    return undefined
  }
  return D.toNumber(D.roundHalfUp(D.multiply(min, D.integer(100)), 0))
}

function sanctionContext(rulesFile: T.RulesFile, request: T.EvaluationRequest) {
  return createContext({
    vocabulary: createEngineVocabulary([...rulesFile.proposedCore, ...rulesFile.terms]),
    request,
    settings: rulesFile.settings,
    answers: { documentReviews: [], judgments: [], conditionAnswers: [] },
    derive: deriveProperty
  })
}

const fresh = (context: Context): Context => ({ ...context, reads: [], deriving: new Set() })

const requestScope = (context: Context): Scope => ({ subject: { type: "entity", id: context.rootId("request") } })

/** Whether a condition holds for a request as sanctions read it, such as a procedure the settings require first. */
export const conditionHolds = (rulesFile: T.RulesFile, request: T.EvaluationRequest, condition: T.Condition) => {
  const context = sanctionContext(rulesFile, request)
  return evaluateCondition(context, requestScope(context), condition)
}

const selects = (selection: T.RuleSelection, rule: T.Rule) =>
  Array.isArray(selection)
    ? selection.includes(rule.key)
    : !selection.except.includes(rule.key) && selection.documents.includes(documentKeyOf(mainProvision(rule)))

/** Whether a sanction rule enforces a broken rule: by its key, or its whole document. */
export const enforces = (sanction: T.SanctionRule, rule: T.Rule) =>
  !sanction.enforces.except.includes(rule.key) &&
  (sanction.enforces.rules.includes(rule.key) ||
    sanction.enforces.documents.includes(documentKeyOf(mainProvision(rule))))

/** The last day of a period from a day, rolled forward past weekends and holidays when the settings say so. */
function periodEnd(context: Context, from: number, amount: T.Amount) {
  const shifted = amount.value === 0 ? from : context.shift(from, amount.value, amount.unit)
  if (shifted === undefined) {
    return undefined
  }
  return context.settings.clauses.time.rollForward ? C.nextBusinessDay(shifted, context.holidays) : shifted
}

/** A rule's cure period: its own, none for an event or health and safety, or the settings' default. */
export function curePeriodOf(context: Context, rule: T.NormRule): CurePeriod {
  const reading = fresh(context)
  const period = curePeriodIn(reading, rule)
  // What it read, for asking what's unknown.
  context.reads.push(...reading.reads)
  return period
}

function curePeriodIn(reading: Context, rule: T.NormRule): CurePeriod {
  const base = { ruleKey: rule.key, startsOn: null, endsOn: null, curedOn: null, needs: [] }
  const thing = rule.appliesTo ? reading.vocabulary.get(reading.vocabulary.thingOf(rule.appliesTo)) : undefined
  if (thing?.kind === "thing" && thing.nature === "event") {
    return { ...base, status: "none", reason: "It's about an event that's over, so it can't be cured.", citations: [] }
  }
  if (rule.cure === "none") {
    return { ...base, status: "none", reason: "The rule allows no time to cure.", citations: rule.citations }
  }
  const cure = rule.cure ?? reading.settings.clauses.cure
  const citations = rule.cure ? rule.citations : (reading.settings.clauses.cure?.citations ?? [])
  if (!cure) {
    return { ...base, status: "none", reason: "Neither the rule nor the documents give a time to cure.", citations }
  }
  const scope = requestScope(reading)
  const start = dayOf(resolvePath(reading, scope, cure.after))
  const label = (path: T.Path) => reading.vocabulary.label(path.path.at(-1) ?? "")
  if (start.state === "absent") {
    return { ...base, status: "not-started", reason: `It starts on the ${label(cure.after)} date.`, citations }
  }
  if (start.state === "unknown") {
    return { ...base, status: "unknown", reason: "", citations, needs: [label(cure.after)] }
  }
  const end = periodEnd(reading, start.day, cure)
  if (end === undefined) {
    return { ...base, status: "unknown", reason: "Its period isn't a span of time.", citations }
  }
  const startsOn = C.fromDay(start.day)
  const endsOn = C.fromDay(end)
  const cured = cure.curedBy ? dayOf(resolvePath(reading, scope, cure.curedBy)) : ({ state: "absent" } as const)
  if (cured.state === "unknown") {
    return { ...base, status: "unknown", reason: "", startsOn, endsOn, citations, needs: unknownLabels(reading) }
  }
  const curedOn = cured.state === "known" ? C.fromDay(cured.day) : null
  if (cured.state === "known" && cured.day <= end) {
    return {
      ...base,
      status: "cured",
      reason: `Cured on ${curedOn}, within the time to cure.`,
      startsOn,
      endsOn,
      curedOn,
      citations
    }
  }
  if (cured.state === "absent" && reading.evaluationDay <= end) {
    return { ...base, status: "running", reason: `It can be cured through ${endsOn}.`, startsOn, endsOn, citations }
  }
  return {
    ...base,
    status: "passed",
    reason: `The time to cure ended on ${endsOn}.`,
    startsOn,
    endsOn,
    curedOn,
    citations
  }
}

type Limits = { rules: T.LimitRule[]; forbids: T.LimitRule | null; isUnclear: boolean }

/** The limits in force on a sanction rule in this request: whether one forbids it, and those that cap it. */
function limitsOn(context: Context, limits: T.LimitRule[], sanction: T.SanctionRule): Limits {
  const applying = limits
    .filter((limit) => limit.limits.includes(sanction.key))
    .map((limit) => ({
      limit,
      applies: limit.appliesWhen ? evaluateCondition(context, requestScope(context), limit.appliesWhen) : true
    }))
  const forbidding = applying.filter(({ limit }) => limit.forbids)
  return {
    rules: applying.filter(({ applies }) => applies !== false).map(({ limit }) => limit),
    forbids: forbidding.find(({ applies }) => applies === true)?.limit ?? null,
    isUnclear: forbidding.some(({ applies }) => applies === null)
  }
}

/** The least of the amounts that cap something, with the rule each comes from; null when nothing caps it. */
function leastCap(context: Context, caps: { operand: T.Operand | null; from: T.RuleKey }[]) {
  return caps.reduce<{ cents: number; from: T.RuleKey } | null>((least, { operand, from }) => {
    if (!operand) {
      return least
    }
    const cents = centsOf(evaluateOperand(context, requestScope(context), operand))
    return cents !== undefined && (least === null || cents < least.cents) ? { cents, from } : least
  }, null)
}

/** How many whole periods have run from a day through another. */
function periodsBetween(context: Context, from: number, through: number, every: T.Amount) {
  // A daily fine for decades is a few thousand periods; the guard only stops a unit that never moves.
  const guard = 100_000
  let periods = 0
  for (let next = context.shift(from, every.value, every.unit); next !== undefined && next <= through;) {
    periods += 1
    if (periods >= guard) {
      break
    }
    next = context.shift(from, every.value * (periods + 1), every.unit)
  }
  return periods
}

function amountOf(
  context: Context,
  rule: T.SanctionRule,
  occurrence: number | null,
  cure: CurePeriod | null,
  limits: T.LimitRule[]
): SanctionAmount {
  const { sanction } = rule
  const scope = requestScope(context)
  const maxEach = leastCap(
    context,
    limits.map((limit) => ({ operand: limit.maxAmount, from: limit.key }))
  )
  const maxTotal = leastCap(context, [
    { operand: sanction.cap, from: rule.key },
    ...limits.map((limit) => ({ operand: limit.maxTotal, from: limit.key }))
  ])
  if (sanction.amounts === "none") {
    return { type: "none" }
  }
  if (sanction.amounts === "set-by-imposer") {
    return { type: "set-by-imposer", maxEach: maxEach?.cents ?? null, maxTotal: maxTotal?.cents ?? null }
  }
  if (sanction.occurrences && occurrence === null) {
    return { type: "unknown", needs: [context.vocabulary.label("violation.occurrence")] }
  }
  const index = Math.min(Math.max(occurrence ?? 1, 1), sanction.amounts.length) - 1
  const scheduled = sanction.amounts[index]
  const scheduledCents = scheduled ? centsOf(evaluateOperand(context, scope, scheduled)) : undefined
  if (scheduledCents === undefined) {
    return { type: "unknown", needs: unknownLabels(context) }
  }
  const each = maxEach ? Math.min(scheduledCents, maxEach.cents) : scheduledCents
  const repeats = repeatsOf(context, sanction, cure)
  if (repeats === undefined) {
    return { type: "unknown", needs: unknownLabels(context) }
  }
  const uncapped = each + (repeats ? repeats.each * repeats.periods : 0)
  if (maxTotal !== null && maxTotal.cents < uncapped) {
    return { type: "fixed", each, repeats, total: maxTotal.cents, cappedBy: maxTotal.from }
  }
  const isEachCapped = maxEach !== null && maxEach.cents < scheduledCents
  return { type: "fixed", each, repeats, total: uncapped, cappedBy: isEachCapped ? maxEach.from : null }
}

/** What a sanction adds each period while the violation continues; null when it doesn't repeat. */
function repeatsOf(context: Context, sanction: T.Sanction, cure: CurePeriod | null) {
  if (!sanction.repeats) {
    return null
  }
  const scope = requestScope(context)
  const each = centsOf(evaluateOperand(context, scope, sanction.repeats.amount))
  // Nothing has run while the violation can still be cured.
  if (cure?.status === "not-started" || cure?.status === "running") {
    return each === undefined ? undefined : { every: sanction.repeats.every, each, periods: 0 }
  }
  const fromDay = (() => {
    if (sanction.repeats.from) {
      const from = dayOf(resolvePath(context, scope, sanction.repeats.from))
      return from.state === "known" ? from.day : undefined
    }
    // By default, from the end of the cure period, or from the governing date when there's none.
    if (cure?.endsOn) {
      return C.toDay(cure.endsOn)
    }
    return cure && cure.status !== "none" ? undefined : context.governingDay
  })()
  if (fromDay === undefined || each === undefined) {
    return undefined
  }
  const through = cure?.curedOn ? Math.min(C.toDay(cure.curedOn), context.evaluationDay) : context.evaluationDay
  return {
    every: sanction.repeats.every,
    each,
    periods: periodsBetween(context, fromDay, through, sanction.repeats.every)
  }
}

/** The parties a sanction reaches: its own, plus whoever the liability settings make answer for them. */
function againstOf(context: Context, rule: T.SanctionRule) {
  const answering = context.settings.clauses.liability.filter((liability) => {
    if (!rule.against.some((party) => context.vocabulary.isKindOf(party, liability.actor))) {
      return false
    }
    if (selects(liability.except, rule)) {
      return false
    }
    const scope = requestScope(context)
    const holds = liability.appliesWhen ? evaluateCondition(context, scope, liability.appliesWhen) : true
    const until = liability.until ? dayOf(resolvePath(context, scope, liability.until)) : null
    return holds !== false && !(until?.state === "known" && until.day <= context.governingDay)
  })
  return [...new Set([...rule.against, ...answering.map((liability) => liability.liable)])]
}

type Waiting = {
  outcome: SanctionOutcome
  reason: string
  availableOn: T.IsoDate | null
  needs: string[]
  precondition?: T.Condition
}

/** What, if anything, a sanction still waits on: its condition, the cure period, its own period, the procedures. */
function waitingOn(context: Context, rule: T.SanctionRule, cure: CurePeriod | null): Waiting | null {
  const scope = requestScope(context)
  const describe = (condition: T.Condition) => describeCondition(condition, context.vocabulary)
  if (rule.appliesWhen) {
    const applies = evaluateCondition(context, scope, rule.appliesWhen)
    if (applies === false) {
      return {
        outcome: "not-applicable",
        reason: `Only when ${describe(rule.appliesWhen)}.`,
        availableOn: null,
        needs: []
      }
    }
    if (applies === null) {
      return { outcome: "missing-information", reason: "", availableOn: null, needs: unknownLabels(context) }
    }
  }
  if (cure) {
    const waiting = match(cure.status)
      .returnType<Waiting | null>()
      .with("cured", () => ({ outcome: "not-applicable", reason: cure.reason, availableOn: null, needs: [] }))
      .with("not-started", () => ({
        outcome: "pending",
        reason: `The time to cure hasn't started. ${cure.reason}`,
        availableOn: null,
        needs: []
      }))
      .with("running", () => ({
        outcome: "pending",
        reason: cure.reason,
        availableOn: cure.endsOn ? C.fromDay(C.toDay(cure.endsOn) + 1) : null,
        needs: []
      }))
      .with("unknown", () => ({ outcome: "missing-information", reason: "", availableOn: null, needs: cure.needs }))
      .otherwise(() => null)
    if (waiting) {
      return waiting
    }
  }
  const { after } = rule.sanction
  if (after) {
    const from = dayOf(resolvePath(context, scope, after.from))
    const label = context.vocabulary.label(after.from.path.at(-1) ?? "")
    if (from.state === "unknown") {
      return { outcome: "missing-information", reason: "", availableOn: null, needs: [label] }
    }
    const first = from.state === "known" ? context.shift(from.day, after.value, after.unit) : undefined
    if (first === undefined || context.evaluationDay < first) {
      return {
        outcome: "pending",
        reason: `Only ${after.value} ${context.vocabulary.label(after.unit, after.value !== 1)} after the ${label} date.`,
        availableOn: first === undefined ? null : C.fromDay(first),
        needs: []
      }
    }
  }
  for (const precondition of context.settings.clauses.sanctionPreconditions) {
    if (!precondition.requestTypes.includes(context.request.type) || selects(precondition.except, rule)) {
      continue
    }
    const holds = evaluateCondition(context, scope, precondition.condition)
    if (holds === false) {
      return {
        outcome: "pending",
        reason: `First: ${describe(precondition.condition)}.`,
        availableOn: null,
        needs: [],
        precondition: precondition.condition
      }
    }
    if (holds === null) {
      return {
        outcome: "missing-information",
        reason: "",
        availableOn: null,
        needs: unknownLabels(context),
        precondition: precondition.condition
      }
    }
  }
  return null
}

/** Whether a limit forbids the sanction, or might. */
function blockedBy(context: Context, limited: Limits): Waiting | null {
  if (limited.forbids) {
    const { title, key } = limited.forbids
    return { outcome: "blocked", reason: `${title} (${key}).`, availableOn: null, needs: [] }
  }
  if (limited.isUnclear) {
    return { outcome: "missing-information", reason: "", availableOn: null, needs: unknownLabels(context) }
  }
  return null
}

function evaluateSanction(
  shared: Context,
  rule: T.SanctionRule,
  broken: T.NormRule,
  cure: CurePeriod | null,
  limits: T.LimitRule[],
  occurrenceOf: NonNullable<SanctionInput["occurrenceOf"]>
): SanctionResult {
  const context = fresh(shared)
  const limited = limitsOn(context, limits, rule)
  const occurrence = rule.sanction.occurrences ? occurrenceOf(rule, broken.key) : null
  const waiting = blockedBy(context, limited) ?? waitingOn(context, rule, cure)
  const amount = amountOf(context, rule, occurrence, cure, limited.rules)
  const verb = rule.modality === "obligation" ? "Must be imposed" : "May be imposed"
  const needs = waiting?.needs ?? (amount.type === "unknown" ? amount.needs : [])
  return {
    ruleKey: rule.key,
    enforced: broken.key,
    outcome: waiting?.outcome ?? "available",
    reason: waiting?.reason || (waiting ? `Needs ${needs.join(" and ")}.` : `${verb}.`),
    availableOn: waiting?.availableOn ?? null,
    needs,
    modality: rule.modality,
    type: rule.sanction.type,
    occurrence,
    amount,
    against: againstOf(context, rule),
    imposedBy: rule.imposedBy,
    suspends: rule.sanction.suspends,
    lasts: rule.sanction.lasts,
    limitedBy: [
      ...new Set([...limited.rules.map((limit) => limit.key), ...(limited.forbids ? [limited.forbids.key] : [])])
    ],
    precondition: waiting?.precondition ?? null,
    inputs: context.reads
  }
}

/** The occurrence the request's own fact gives, for every sanction. */
function occurrenceFact(context: Context) {
  const resolved = resolvePath(fresh(context), requestScope(context), {
    from: "request",
    path: ["violation.occurrence"]
  })
  if (resolved.state !== "known" || resolved.value.type !== "number") {
    return null
  }
  const { min, max } = resolved.value.range
  return min !== null && max !== null && D.compare(min, max) === 0 ? D.toNumber(min) : null
}

export function evaluateSanctions({ rulesFile, request, broken, occurrenceOf }: SanctionInput): SanctionsResult {
  const context = sanctionContext(rulesFile, request)
  const considered = rulesFile.rules.filter((rule) => isConsidered(context, rule))
  const brokenRules = broken.flatMap((key) => {
    const rule = rulesFile.rules.find((candidate) => candidate.key === key)
    return rule?.kind === "norm" ? [rule] : []
  })
  const sanctionRules = considered.filter((rule): rule is T.SanctionRule => rule.kind === "sanction")
  const limits = considered.filter((rule): rule is T.LimitRule => rule.kind === "limit")
  const fromFact = occurrenceFact(context)
  const occurrence = occurrenceOf ?? (() => fromFact)

  const cures = brokenRules.map((rule) => curePeriodOf(context, rule))
  const sanctions = brokenRules.flatMap((rule, index) =>
    sanctionRules
      .filter((sanction) => enforces(sanction, rule))
      .map((sanction) => evaluateSanction(context, sanction, rule, cures[index] ?? null, limits, occurrence))
  )
  return {
    cures,
    sanctions: sanctions.toSorted(
      (a, b) => outcomeOrder.indexOf(a.outcome) - outcomeOrder.indexOf(b.outcome) || a.ruleKey.localeCompare(b.ruleKey)
    ),
    reads: [...context.reads, ...sanctions.flatMap((sanction) => sanction.inputs)]
  }
}
