import { match, P } from "ts-pattern"
import type * as T from "@/schema/types"
import * as C from "./calendar"
import type { Context, Resolved, Scope } from "./context"
import * as D from "./decimal"
import { evaluateOperand } from "./operands"
import { resolvePath } from "./paths"
import type * as V from "./values"

// Deadline checks (schema.md, Checks; Evaluating a request 5): an act, an anchor date and a window around it, in
// business or calendar days, months or years, rolled forward past weekends and holidays when the settings say so.

export type DeadlineStatus = "complies" | "fails" | "unknown" | "pending"
export type DeadlineResult = { status: DeadlineStatus; effects: T.Finding["effects"] }

type Bound = { day: number; minutes: number }

const pointOf = (evaluated: V.Evaluated) => {
  if (evaluated.kind !== "value") {
    return undefined
  }
  const { value } = evaluated
  if ((value.type !== "date" && value.type !== "instant") || value.range.min === null || value.range.max === null) {
    return undefined
  }
  if (D.compare(value.range.min, value.range.max) !== 0) {
    return undefined
  }
  return { type: value.type, at: Number(D.floor(value.range.min)) }
}

function anchorDay(context: Context, scope: Scope, anchor: T.Operand) {
  const evaluated = evaluateOperand(context, scope, anchor)
  if (evaluated.kind === "value" && evaluated.value.type === "schedule") {
    return C.latestOccurrence(evaluated.value.schedule, context.governingDay, context.shift)
  }
  const point = pointOf(evaluated)
  if (!point) {
    return undefined
  }
  return point.type === "date" ? point.at : Math.floor(point.at / C.minutesPerDay)
}

function bound(context: Context, anchor: number, offset: T.Offset, isEnd: boolean): Bound | undefined {
  const shifted = context.shift(anchor, offset.value, offset.unit)
  if (shifted === undefined) {
    return undefined
  }
  const isRolled = isEnd && context.settings.clauses.time.rollForward
  const day = isRolled ? C.nextBusinessDay(shifted, context.holidays) : shifted
  // A bound without a time covers the whole day.
  if (offset.at) {
    return { day, minutes: C.minutesOf(offset.at) }
  }
  return { day, minutes: isEnd ? C.minutesPerDay : 0 }
}

// What the act's path says: a date, none, not stated, or unclear.
type Act = { state: "happened"; type: "date" | "instant"; at: number } | { state: "absent" | "unstated" | "unclear" }

function actOf(context: Context, scope: Scope, act: T.Operand): Act {
  // A computed date that's only a range hasn't been stated.
  const fromEvaluated = (evaluated: V.Evaluated): Act => {
    const point = pointOf(evaluated)
    return point ? { state: "happened", ...point } : { state: "unstated" }
  }
  if (act.type !== "ref") {
    const evaluated = evaluateOperand(context, scope, act)
    if (evaluated.kind === "value") {
      return fromEvaluated(evaluated)
    }
    return { state: evaluated.kind === "absent" ? "absent" : "unstated" }
  }
  const resolved: Resolved = resolvePath(context, scope, act)
  return match(resolved)
    .returnType<Act>()
    .with({ state: "known" }, ({ value }) => fromEvaluated({ kind: "value", value }))
    .with({ state: "absent" }, () => ({ state: "absent" }))
    .with({ state: "unknown", isUnstated: true }, () => ({ state: "unstated" }))
    .otherwise(() => ({ state: "unclear" }))
}

function isInside(act: Extract<Act, { state: "happened" }>, start: Bound | null, end: Bound | null) {
  if (act.type === "date") {
    return (start === null || act.at >= start.day) && (end === null || act.at <= end.day)
  }
  const minutes = (value: Bound) => value.day * C.minutesPerDay + value.minutes
  return (start === null || act.at >= minutes(start)) && (end === null || act.at < minutes(end))
}

/** An onMiss value as a stated value, for the feature that records it. */
function factValue(context: Context, scope: Scope, operand: T.Operand): T.FactValue | null {
  return match(operand)
    .returnType<T.FactValue | null>()
    .with({ type: "value" }, ({ term }) => ({ type: "value", term, text: context.vocabulary.label(term) }))
    .with({ type: P.union("quantity", "number", "boolean", "date") }, (constant) => constant)
    .with({ type: "time" }, ({ value }) => ({ type: "time", value }))
    .otherwise(() => {
      const point = pointOf(evaluateOperand(context, scope, operand))
      return point?.type === "date" ? { type: "date", value: C.fromDay(point.at) } : null
    })
}

export function evaluateDeadline(
  context: Context,
  scope: Scope,
  check: Extract<T.Check, { type: "deadline" }>
): DeadlineResult {
  const anchor = anchorDay(context, scope, check.anchor)
  const start = anchor === undefined || !check.earliest ? null : bound(context, anchor, check.earliest, false)
  const end = anchor === undefined || !check.latest ? null : bound(context, anchor, check.latest, true)
  if (anchor === undefined || start === undefined || end === undefined) {
    return { status: "unknown", effects: [] }
  }
  const missed = (): DeadlineResult => {
    const from = C.fromDay(end?.day ?? context.evaluationDay)
    const effects = check.onMiss.flatMap((effect) => {
      const value = factValue(context, scope, effect.value)
      return value ? [{ target: effect.target, value, from }] : []
    })
    return { status: "fails", effects }
  }
  const hasEnded = end !== null && context.evaluationDay > end.day
  const act = actOf(context, scope, check.act)
  return (
    match(act)
      .returnType<DeadlineResult>()
      .with({ state: "happened" }, (happened) =>
        isInside(happened, start, end) ? { status: "complies", effects: [] } : missed()
      )
      // Not done yet: pending until the window ends; then it failed, or, when silence means unknown, it's unknown.
      .with({ state: "absent" }, () => (hasEnded ? missed() : { status: "pending", effects: [] }))
      .with({ state: "unstated" }, () => ({ status: hasEnded ? "unknown" : "pending", effects: [] }))
      .with({ state: "unclear" }, () => ({ status: "unknown", effects: [] }))
      .exhaustive()
  )
}
