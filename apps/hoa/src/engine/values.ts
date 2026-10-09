import { match } from "ts-pattern"
import type * as T from "@/schema/types"
import * as D from "./decimal"

// Values as evaluation sees them (schema.md, Expressions 2 to 6). Every condition is true, false or unknown (null),
// and a quantity, count or date nobody stated is a range: anywhere from 0 up, or any date. Arithmetic carries ranges
// through, and a comparison is decided only when every value in its ranges agrees.

export type Truth = boolean | null

/** Inclusive bounds; a null min is unbounded below and a null max unbounded above. */
export type Range = { min: D.Exact | null; max: D.Exact | null }

export type Value =
  | { type: "number"; range: Range; dimension: T.Dimension | null } // quantities in their dimension's base unit
  | { type: "date"; range: Range } // days since 1970-01-01
  | { type: "instant"; range: Range } // local minutes since 1970-01-01 00:00
  | { type: "time"; minutes: number }
  | { type: "boolean"; value: boolean }
  | { type: "term"; term: T.TermKey | null; text: string } // a value term or a party; null: text no term matches
  | { type: "entity"; id: string }
  | { type: "schedule"; schedule: Extract<T.FactValue, { type: "schedule" }> }
  | { type: "text"; text: string }

/** What an operand evaluates to: a value (perhaps a range), none at all, or unknown. */
export type Evaluated = { kind: "value"; value: Value } | { kind: "absent" } | { kind: "unknown" }

export const unknown: Evaluated = { kind: "unknown" }
export const absent: Evaluated = { kind: "absent" }
export const known = (value: Value): Evaluated => ({ kind: "value", value })

// ─── Three-valued logic (Expressions 3) ───────────────────────────────────────────────────────────

export function all(values: Truth[]): Truth {
  if (values.includes(false)) {
    return false
  }
  return values.includes(null) ? null : true
}

export function any(values: Truth[]): Truth {
  if (values.includes(true)) {
    return true
  }
  return values.includes(null) ? null : false
}

export const not = (value: Truth): Truth => (value === null ? null : !value)

// ─── Ranges ───────────────────────────────────────────────────────────────────────────────────────

export const point = (value: D.Exact): Range => ({ min: value, max: value })
export const anyRange: Range = { min: null, max: null }
export const fromZero: Range = { min: D.zero, max: null }

export const isPoint = (range: Range) =>
  range.min !== null && range.max !== null && D.compare(range.min, range.max) === 0

const addBound = (a: D.Exact | null, b: D.Exact | null) => (a === null || b === null ? null : D.add(a, b))

export const addRanges = (a: Range, b: Range): Range => ({ min: addBound(a.min, b.min), max: addBound(a.max, b.max) })

export const negateRange = (a: Range): Range => ({
  min: a.max === null ? null : D.negate(a.max),
  max: a.min === null ? null : D.negate(a.min)
})

export const subtractRanges = (a: Range, b: Range) => addRanges(a, negateRange(b))

// A bound as a signed infinity or a number, for products: 0 times an unbounded side is 0.
type Extended = D.Exact | "-inf" | "+inf"

const lower = (range: Range): Extended => range.min ?? "-inf"
const upper = (range: Range): Extended => range.max ?? "+inf"

function sign(value: Extended) {
  if (typeof value === "string") {
    return value === "-inf" ? -1 : 1
  }
  return D.compare(value, D.zero)
}

function times(a: Extended, b: Extended): Extended {
  if (typeof a !== "string" && typeof b !== "string") {
    return D.multiply(a, b)
  }
  const product = sign(a) * sign(b)
  if (product === 0) {
    return D.zero
  }
  return product < 0 ? "-inf" : "+inf"
}

function compareExtended(a: Extended, b: Extended) {
  if (typeof a === "string" || typeof b === "string") {
    // Finite values rank between the infinities; only one side is infinite or both are.
    const rank = (value: Extended) => (typeof value === "string" ? sign(value) : 0)
    return Math.sign(rank(a) - rank(b))
  }
  return D.compare(a, b)
}

function hull(corners: Extended[]): Range {
  const sorted = corners.toSorted(compareExtended)
  const [first] = sorted
  const last = sorted.at(-1)
  return {
    min: first === undefined || typeof first === "string" ? null : first,
    max: last === undefined || typeof last === "string" ? null : last
  }
}

export function multiplyRanges(a: Range, b: Range): Range {
  const corners = [lower(a), upper(a)].flatMap((x) => [lower(b), upper(b)].map((y) => times(x, y)))
  return hull(corners)
}

const containsZero = (range: Range) =>
  (range.min === null || D.compare(range.min, D.zero) <= 0) && (range.max === null || D.compare(range.max, D.zero) >= 0)

export function divideRanges(a: Range, b: Range): Range {
  if (containsZero(b)) {
    const isNonNegative = (range: Range) => range.min !== null && D.compare(range.min, D.zero) >= 0
    return isNonNegative(a) && isNonNegative(b) ? fromZero : anyRange
  }
  const reciprocal = (value: Extended): Extended => (typeof value === "string" ? D.zero : D.divide(D.integer(1), value))
  return multiplyRanges(a, hull([reciprocal(lower(b)), reciprocal(upper(b))]))
}

const pick = (a: D.Exact | null, b: D.Exact | null, wantGreater: boolean, nullWins: boolean) => {
  if (a === null || b === null) {
    return nullWins ? null : (a ?? b)
  }
  const isAGreater = D.compare(a, b) >= 0
  return isAGreater === wantGreater ? a : b
}

/** The range of the greater of two values. */
export const greatestRange = (a: Range, b: Range): Range => ({
  min: pick(a.min, b.min, true, false),
  max: pick(a.max, b.max, true, true)
})

/** The range of the lesser of two values. */
export const leastRange = (a: Range, b: Range): Range => ({
  min: pick(a.min, b.min, false, true),
  max: pick(a.max, b.max, false, false)
})

export const shiftRange = (range: Range, by: (value: D.Exact) => D.Exact): Range => ({
  min: range.min === null ? null : by(range.min),
  max: range.max === null ? null : by(range.max)
})

/** Whether a comparison holds for every value in the ranges (true), for none (false), or depends (null). */
export function compareRanges(a: Range, op: T.Comparator, b: Range): Truth {
  const isBelow = (x: D.Exact | null, y: D.Exact | null, orEqual: boolean) =>
    x !== null && y !== null && (orEqual ? D.compare(x, y) <= 0 : D.compare(x, y) < 0)
  const lessThan = (x: Range, y: Range, orEqual: boolean): Truth => {
    if (isBelow(x.max, y.min, orEqual)) {
      return true
    }
    return isBelow(y.max, x.min, !orEqual) ? false : null
  }
  return match(op)
    .returnType<Truth>()
    .with("<", () => lessThan(a, b, false))
    .with("<=", () => lessThan(a, b, true))
    .with(">", () => lessThan(b, a, false))
    .with(">=", () => lessThan(b, a, true))
    .with("=", () => equalRanges(a, b))
    .with("!=", () => not(equalRanges(a, b)))
    .exhaustive()
}

function equalRanges(a: Range, b: Range): Truth {
  if (isPoint(a) && isPoint(b) && a.min && b.min) {
    return D.compare(a.min, b.min) === 0
  }
  const isDisjoint =
    (a.max !== null && b.min !== null && D.compare(a.max, b.min) < 0) ||
    (b.max !== null && a.min !== null && D.compare(b.max, a.min) < 0)
  return isDisjoint ? false : null
}
