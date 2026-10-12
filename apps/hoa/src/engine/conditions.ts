import { match, P } from "ts-pattern"
import type * as T from "@/schema/types"
import * as C from "./calendar"
import type { Context, Scope } from "./context"
import * as D from "./decimal"
import { evaluateOperand } from "./operands"
import { readProperty, resolveItems, resolvePath } from "./paths"
import * as V from "./values"

// Conditions (schema.md, Expressions 3, 6, 8, 9, 10 and 13): every one is true, false or unknown (null).

// ─── Comparing values ─────────────────────────────────────────────────────────────────────────────

type Temporal = Extract<V.Value, { type: "date" | "instant" }>

const toDays = (value: Temporal): V.Range =>
  value.type === "date"
    ? value.range
    : V.shiftRange(value.range, (minutes) => D.integer(D.floor(D.divide(minutes, D.integer(C.minutesPerDay)))))

function termsEqual(context: Context, a: string | null, b: string | null) {
  if (a === null || b === null) {
    return false
  }
  const { isParty, isKindOf } = context.vocabulary
  return a === b || (isParty(a) && isParty(b) && (isKindOf(a, b) || isKindOf(b, a)))
}

/** a op b. An absent value, reference or date makes every comparison false except != (Expressions 6). */
export function compareValues(context: Context, a: V.Evaluated, op: T.Comparator, b: V.Evaluated): V.Truth {
  if (a.kind === "unknown" || b.kind === "unknown") {
    return null
  }
  if (a.kind === "absent" || b.kind === "absent") {
    return op === "!="
  }
  const isEquality = op === "=" || op === "!="
  const equality = (isEqual: boolean) => (isEquality ? (op === "=") === isEqual : null)
  return match([a.value, b.value])
    .returnType<V.Truth>()
    .with([{ type: "number" }, { type: "number" }], ([x, y]) => {
      const isComparable = x.dimension === null || y.dimension === null || x.dimension === y.dimension
      return isComparable ? V.compareRanges(x.range, op, y.range) : null
    })
    .with([{ type: P.union("date", "instant") }, { type: P.union("date", "instant") }], ([x, y]) =>
      x.type === y.type ? V.compareRanges(x.range, op, y.range) : V.compareRanges(toDays(x), op, toDays(y))
    )
    .with([{ type: "time" }, { type: "time" }], ([x, y]) =>
      V.compareRanges(V.point(D.integer(x.minutes)), op, V.point(D.integer(y.minutes)))
    )
    .with([{ type: "boolean" }, { type: "boolean" }], ([x, y]) => equality(x.value === y.value))
    .with([{ type: "term" }, { type: "term" }], ([x, y]) => equality(termsEqual(context, x.term, y.term)))
    .with([{ type: "entity" }, { type: "entity" }], ([x, y]) => equality(x.id === y.id))
    .otherwise(() => null)
}

/** Whether a value is under a listed one: the same, or a narrower value or party (Expressions 8). */
function isUnder(context: Context, value: V.Evaluated, listed: V.Evaluated): V.Truth {
  if (
    value.kind === "value" &&
    value.value.type === "term" &&
    listed.kind === "value" &&
    listed.value.type === "term"
  ) {
    const { term } = value.value
    const listedTerm = listed.value.term
    return term !== null && listedTerm !== null && context.vocabulary.isUnder(term, listedTerm)
  }
  return compareValues(context, value, "=", listed)
}

/** Whether a value is under any of the listed ones. */
export const isAmong = (context: Context, value: V.Evaluated, listed: V.Evaluated[]) =>
  V.any(listed.map((item) => isUnder(context, value, item)))

// ─── Category membership ──────────────────────────────────────────────────────────────────────────

/** Whether an entity is of a type: typed as it or a category under it, or meeting a category's criteria. */
export function isA(context: Context, entityId: string, type: T.TermKey): V.Truth {
  const entity = context.entities.get(entityId)
  if (!entity) {
    return null
  }
  const { vocabulary } = context
  if (vocabulary.isKindOf(entity.type, type)) {
    return true
  }
  const category = vocabulary.category(type)
  if (!category) {
    return false
  }
  const ofParent = isA(context, entityId, category.of)
  if (ofParent === false) {
    return false
  }
  return V.all([ofParent, evaluateCondition(context, { subject: { type: "entity", id: entityId } }, category.criteria)])
}

// ─── Approvals (Expressions 9) ────────────────────────────────────────────────────────────────────

// The core approval terms: approvals arrive as entities of type approval from the feature that records them.
const approvalStatus = { approved: "approval-status.approved", denied: "approval-status.denied" }

export type ApprovalState = { satisfied: V.Truth; impossible: V.Truth }

export function approvalOf(context: Context, entityId: string, test: T.ApprovalTest): ApprovalState {
  const { vocabulary } = context
  const approvals = context.request.entities.filter((entity) => vocabulary.isKindOf(entity.type, "approval"))
  const read = (approval: string, key: string): V.Evaluated => {
    const property = vocabulary.property(key)
    if (!property) {
      return V.unknown
    }
    const resolved = readProperty(context, approval, property)
    if (resolved.state === "known") {
      return V.known(resolved.value)
    }
    return resolved.state === "absent" ? V.absent : V.unknown
  }
  const term = (value: string): V.Evaluated => V.known({ type: "term", term: value, text: value })

  const facts = approvals.map(({ id }) => {
    const on = read(id, "approval.on")
    return {
      covers: compareValues(context, read(id, "approval.covers"), "=", V.known({ type: "entity", id: entityId })),
      by: read(id, "approval.by"),
      status: read(id, "approval.status"),
      isWritten: test.written
        ? compareValues(context, read(id, "approval.written"), "=", V.known({ type: "boolean", value: true }))
        : true,
      isPrior: test.prior
        ? compareValues(context, on, "<=", V.known({ type: "date", range: V.point(D.integer(context.governingDay)) }))
        : true
    }
  })

  const byParty = (party: string, status: string, isApproval: boolean) =>
    V.any(
      facts.map((fact) =>
        V.all([
          fact.covers,
          isUnder(context, fact.by, term(party)),
          isUnder(context, fact.status, term(status)),
          ...(isApproval ? [fact.isWritten, fact.isPrior] : [])
        ])
      )
    )
  const approved = test.by.map((party) => byParty(party, approvalStatus.approved, true))
  const denied = test.by.map((party) => byParty(party, approvalStatus.denied, false))
  return test.needs === "all"
    ? { satisfied: V.all(approved), impossible: V.any(denied) }
    : { satisfied: V.any(approved), impossible: V.all(denied) }
}

// ─── Time windows (Expressions 10) ────────────────────────────────────────────────────────────────

type Span = { start: number; end: number | null } // local minutes, end exclusive; null: may run on indefinitely

// Spans and windows longer than this are looked at only this far; the portal's windows are hours or days.
const horizonDays = 400

function spanOf(start: V.Evaluated, end: V.Evaluated): Span | null {
  const asMinutes = (value: V.Evaluated, isEnd: boolean) => {
    if (value.kind !== "value" || (value.value.type !== "date" && value.value.type !== "instant")) {
      return null
    }
    const { range } = value.value
    if (!V.isPoint(range) || range.min === null) {
      return null
    }
    const bound = Number(D.floor(range.min))
    if (value.value.type === "date") {
      return (bound + (isEnd ? 1 : 0)) * C.minutesPerDay
    }
    return isEnd ? bound + 1 : bound
  }
  const from = asMinutes(start, false)
  return from === null ? null : { start: from, end: asMinutes(end, true) }
}

function occurrences(context: Context, scope: Scope, window: T.TimeWindow, span: Span) {
  const firstDay = Math.floor(span.start / C.minutesPerDay) - 1
  const lastDay = Math.min(Math.floor((span.end ?? span.start) / C.minutesPerDay) + 1, firstDay + horizonDays)
  const days = Array.from({ length: lastDay - firstDay + 1 }, (_, i) => firstDay + i)
  const wrap = (day: number, from: number, to: number) => ({
    start: day * C.minutesPerDay + from,
    end: (to <= from ? day + 1 : day) * C.minutesPerDay + to
  })
  return match(window)
    .with({ type: "daily" }, ({ from, to }) => days.map((day) => wrap(day, C.minutesOf(from), C.minutesOf(to))))
    .with({ type: "weekly" }, ({ days: weekdays, from, to }) =>
      days
        .filter((day) => weekdays.includes(C.weekdayOf(day)))
        .map((day) => wrap(day, from ? C.minutesOf(from) : 0, to ? C.minutesOf(to) : C.minutesPerDay))
    )
    .with({ type: "annual" }, ({ from, to }) => {
      // An occurrence that wraps the year end starts in the year before.
      const yearOf = (day: number) => Number(C.fromDay(day).slice(0, 4))
      const years = Array.from({ length: yearOf(lastDay) - yearOf(firstDay) + 2 }, (_, i) => yearOf(firstDay) - 1 + i)
      return years.map((year) => {
        const first = C.toDay(`${year}-${from}`)
        const sameYear = C.toDay(`${year}-${to}`)
        const last = sameYear >= first ? sameYear : C.toDay(`${year + 1}-${to}`)
        return { start: first * C.minutesPerDay, end: (last + 1) * C.minutesPerDay }
      })
    })
    .with({ type: "recurring" }, (recurring) => {
      const schedule = evaluateOperand(context, scope, recurring.schedule)
      if (schedule.kind !== "value" || schedule.value.type !== "schedule") {
        return null
      }
      const bound = (day: number, offset: T.Offset | null, isEnd: boolean) => {
        const shifted = offset ? context.shift(day, offset.value, offset.unit) : day
        if (shifted === undefined) {
          return null
        }
        const atMinutes = offset?.at ? C.minutesOf(offset.at) : null
        return shifted * C.minutesPerDay + (atMinutes ?? (isEnd ? C.minutesPerDay : 0))
      }
      // An occurrence can start up to a horizon before the day it's around.
      const scheduled = C.scheduleDays(
        schedule.value.schedule,
        firstDay - horizonDays,
        lastDay + horizonDays,
        context.shift
      )
      return scheduled.flatMap((day) => {
        const start = bound(day, recurring.from, false)
        const end = bound(day, recurring.to, true)
        return start === null || end === null ? [] : [{ start, end }]
      })
    })
    .exhaustive()
}

function during(context: Context, scope: Scope, condition: Extract<T.Condition, { type: "during" }>): V.Truth {
  const span = spanOf(evaluateOperand(context, scope, condition.start), evaluateOperand(context, scope, condition.end))
  if (!span) {
    return null
  }
  const windows = occurrences(context, scope, condition.window, span)
  if (!windows) {
    return null
  }
  const containsStart = windows.some((window) => window.start <= span.start && span.start < window.end)
  if (span.end === null) {
    if (condition.match === "within") {
      return containsStart ? null : false
    }
    return containsStart ? true : null
  }
  const { end } = span
  if (condition.match === "within") {
    return windows.some((window) => window.start <= span.start && end <= window.end)
  }
  return windows.some((window) => window.start < end && span.start < window.end)
}

// ─── Conditions ───────────────────────────────────────────────────────────────────────────────────

type Quantifier = Extract<T.Condition, { type: "every" | "some" | "none" }>

// every, some and none over the items that satisfy where; an item whose where is unknown counts as unknown, and an
// incomplete list may hold items that change the answer (Expressions 3 and 5).
function quantify(context: Context, scope: Scope, condition: Quantifier): V.Truth {
  const list = resolveItems(context, scope, condition)
  if (!list) {
    return null
  }
  const results = list.items.flatMap((item) => {
    const itemScope = { subject: item }
    const where = condition.where ? evaluateCondition(context, itemScope, condition.where) : true
    if (where === false) {
      return []
    }
    const test = evaluateCondition(context, itemScope, condition.test)
    return [where === null && test !== null ? null : test]
  })
  const isOpen = !list.isComplete || list.unclear > 0
  const some = V.any(results)
  const decidedSome = some === false && isOpen ? null : some
  return match(condition.type)
    .with("some", () => decidedSome)
    .with("none", () => V.not(decidedSome))
    .with("every", () => {
      const every = V.all(results)
      return every === true && isOpen ? null : every
    })
    .exhaustive()
}

function exists(context: Context, scope: Scope, path: T.Path): V.Truth {
  const last = path.path.at(-1)
  if (last !== undefined && context.vocabulary.property(last)?.many) {
    const list = resolveItems(context, scope, path)
    if (!list) {
      return null
    }
    if (list.items.length > 0) {
      return true
    }
    return list.isComplete && list.unclear === 0 ? false : null
  }
  const resolved = resolvePath(context, scope, path)
  if (resolved.state === "known") {
    return true
  }
  return resolved.state === "absent" ? false : null
}

// The entity a path reaches, for is-a and approved: false when there's none, null when it's unknown.
function entityAt(context: Context, scope: Scope, path: T.Path, test: (id: string) => V.Truth): V.Truth {
  const resolved = resolvePath(context, scope, path)
  if (resolved.state === "absent") {
    return false
  }
  if (resolved.state === "unknown") {
    return null
  }
  return resolved.value.type === "entity" ? test(resolved.value.id) : false
}

export function evaluateCondition(context: Context, scope: Scope, condition: T.Condition): V.Truth {
  const operand = (value: T.Operand) => evaluateOperand(context, scope, value)
  return match(condition)
    .returnType<V.Truth>()
    .with({ type: "all" }, ({ of }) => V.all(of.map((item) => evaluateCondition(context, scope, item))))
    .with({ type: "any" }, ({ of }) => V.any(of.map((item) => evaluateCondition(context, scope, item))))
    .with({ type: "not" }, ({ of }) => V.not(evaluateCondition(context, scope, of)))
    .with({ type: "compare" }, ({ left, op, right }) => compareValues(context, operand(left), op, operand(right)))
    .with({ type: "in" }, ({ left, values }) => isAmong(context, operand(left), values.map(operand)))
    .with({ type: "between" }, (between) => {
      const value = operand(between.left)
      return V.all([
        compareValues(context, value, between.includeMin ? ">=" : ">", operand(between.min)),
        compareValues(context, value, between.includeMax ? "<=" : "<", operand(between.max))
      ])
    })
    .with({ type: "exists" }, (path) => exists(context, scope, path))
    .with({ type: "is-a" }, (isACondition) =>
      entityAt(context, scope, isACondition, (id) => isA(context, id, isACondition.category))
    )
    .with({ type: "approved" }, (approved) =>
      entityAt(context, scope, approved, (id) => approvalOf(context, id, approved).satisfied)
    )
    .with({ type: P.union("every", "some", "none") }, (quantifier) => quantify(context, scope, quantifier))
    .with({ type: "during" }, (duringCondition) => during(context, scope, duringCondition))
    .with({ type: "text" }, ({ text }) => {
      const { subject } = scope
      if (subject.type !== "entity") {
        return null
      }
      const answer = context.answers.conditionAnswers.find(
        (candidate) => candidate.entity === subject.id && candidate.text === text
      )
      return answer?.holds ?? null
    })
    .exhaustive()
}
