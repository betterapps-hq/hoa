import { match, P } from "ts-pattern"
import type * as T from "@/schema/types"
import { minutesOf, minutesPerDay, toDay } from "./calendar"
import { evaluateCondition } from "./conditions"
import type { Context, Resolved, Scope } from "./context"
import * as D from "./decimal"
import { resolveItems, resolvePath } from "./paths"
import * as V from "./values"
import { toBase } from "./vocabulary"

// Operands (schema.md, Expressions 4 to 7 and 11): constants, references and arithmetic. Unknown quantities, counts
// and dates become ranges here, and absent quantities and counts become 0.

type NumberValue = Extract<V.Value, { type: "number" }>
type TemporalValue = Extract<V.Value, { type: "date" | "instant" }>

const numberValue = (range: V.Range, dimension: T.Dimension | null = null): V.Evaluated =>
  V.known({ type: "number", range, dimension })

/** A path's value as an operand, with silence turned into ranges and zeros by the property's type. */
export function evaluateRef(context: Context, scope: Scope, path: T.Path): V.Evaluated {
  const resolved = resolvePath(context, scope, path)
  return fromResolved(context, resolved, path.path.at(-1))
}

function fromResolved(context: Context, resolved: Resolved, propertyKey: T.TermKey | undefined): V.Evaluated {
  if (resolved.state === "known") {
    return V.known(resolved.value)
  }
  if (resolved.state === "unknown" && resolved.partial) {
    return V.known(resolved.partial)
  }
  const valueType = propertyKey === undefined ? undefined : context.vocabulary.property(propertyKey)?.valueType
  const isAbsent = resolved.state === "absent"
  return match(valueType)
    .returnType<V.Evaluated>()
    .with({ type: "quantity" }, ({ unit }) => {
      const dimension = context.vocabulary.unit(unit)?.dimension ?? null
      return numberValue(isAbsent ? V.point(D.zero) : V.fromZero, dimension)
    })
    .with({ type: "count" }, () => numberValue(isAbsent ? V.point(D.zero) : V.fromZero))
    .with({ type: P.union("date", "date-time") }, ({ type }) => {
      if (isAbsent) {
        return V.absent
      }
      return V.known({ type: type === "date" ? "date" : "instant", range: V.anyRange })
    })
    .otherwise(() => (isAbsent ? V.absent : V.unknown))
}

const asNumber = (evaluated: V.Evaluated): NumberValue | undefined =>
  evaluated.kind === "value" && evaluated.value.type === "number" ? evaluated.value : undefined

const asTemporal = (evaluated: V.Evaluated): TemporalValue | undefined =>
  evaluated.kind === "value" && (evaluated.value.type === "date" || evaluated.value.type === "instant")
    ? evaluated.value
    : undefined

// Arithmetic over numbers of one dimension; anything else is a type mismatch, which validation reports.
function combine(
  operands: V.Evaluated[],
  numbers: (ranges: V.Range[]) => V.Range,
  dates: ((ranges: V.Range[]) => V.Range) | null
): V.Evaluated {
  if (operands.some((operand) => operand.kind === "unknown")) {
    return V.unknown
  }
  const numericOperands = operands.map(asNumber)
  if (numericOperands.every((operand) => operand !== undefined)) {
    const dimension = numericOperands.find((operand) => operand.dimension !== null)?.dimension ?? null
    return numberValue(numbers(numericOperands.map((operand) => operand.range)), dimension)
  }
  if (operands.some((operand) => operand.kind === "absent")) {
    return V.absent
  }
  const temporal = operands.map(asTemporal)
  const [first] = temporal
  if (dates && first && temporal.every((operand) => operand?.type === first.type)) {
    return V.known({ type: first.type, range: dates(temporal.flatMap((operand) => (operand ? [operand.range] : []))) })
  }
  return V.unknown
}

const fold = (step: (a: V.Range, b: V.Range) => V.Range) => (ranges: V.Range[]) =>
  ranges.slice(1).reduce(step, ranges[0] ?? V.point(D.zero))

/** Shifts a date or date-time by an amount of time, carrying ranges (schema.md, Expressions 11). */
function shiftTemporal(context: Context, value: TemporalValue, by: T.Amount): V.Evaluated {
  if (context.shift(0, by.value, by.unit) === undefined) {
    return V.unknown
  }
  const perDay = value.type === "date" ? 1 : minutesPerDay
  const range = V.shiftRange(value.range, (bound) => {
    const day = Number(D.floor(D.divide(bound, D.integer(perDay))))
    const shifted = context.shift(day, by.value, by.unit) ?? day
    return D.add(bound, D.integer((shifted - day) * perDay))
  })
  return V.known({ type: value.type, range })
}

type Aggregate = Extract<T.Operand, { type: "count" | "sum-of" | "greatest-of" | "least-of" }>

// count, sum-of, greatest-of and least-of over a many-valued path (schema.md, Expressions 5): an item whose where is
// unknown may or may not count, and an incomplete list may have more items.
function aggregate(context: Context, scope: Scope, operand: Aggregate): V.Evaluated {
  const list = resolveItems(context, scope, operand)
  if (!list) {
    return V.unknown
  }
  const counted: { range: V.Range; isCertain: boolean }[] = []
  for (const item of list.items) {
    const where = operand.where ? evaluateCondition(context, { subject: item }, operand.where) : true
    if (where === false) {
      continue
    }
    if (operand.type === "count") {
      counted.push({ range: V.point(D.integer(1)), isCertain: where === true })
      continue
    }
    const value = asNumber(evaluateRef(context, { subject: item }, { path: operand.value }))
    if (!value) {
      return V.unknown
    }
    counted.push({ range: value.range, isCertain: where === true })
  }
  const isOpen = !list.isComplete || list.unclear > 0
  const certain = counted.filter((entry) => entry.isCertain).map((entry) => entry.range)
  const possible = counted.filter((entry) => !entry.isCertain).map((entry) => entry.range)
  const dimension =
    operand.type === "count" ? null : (context.vocabulary.unit(unitOf(context, operand.value) ?? "")?.dimension ?? null)
  return match(operand.type)
    .with(P.union("count", "sum-of"), () => {
      const sure = fold(V.addRanges)(certain)
      const maybe = possible.reduce((sum, range) => V.addRanges(sum, V.greatestRange(range, V.point(D.zero))), sure)
      const min = possible.reduce((sum, range) => V.addRanges(sum, V.leastRange(range, V.point(D.zero))), sure).min
      return numberValue({ min, max: isOpen ? null : maybe.max }, dimension)
    })
    .with(P.union("greatest-of", "least-of"), (type) => {
      const all = [...certain, ...possible]
      if (all.length === 0) {
        return isOpen ? numberValue(V.anyRange, dimension) : V.absent
      }
      const isGreatest = type === "greatest-of"
      const range = fold(isGreatest ? V.greatestRange : V.leastRange)(all)
      return numberValue(
        isGreatest ? { ...range, max: isOpen ? null : range.max } : { ...range, min: isOpen ? null : range.min },
        dimension
      )
    })
    .exhaustive()
}

function unitOf(context: Context, path: T.TermKey[]) {
  const valueType = context.vocabulary.property(path.at(-1) ?? "")?.valueType
  return valueType?.type === "quantity" ? valueType.unit : undefined
}

export function evaluateOperand(context: Context, scope: Scope, operand: T.Operand): V.Evaluated {
  return match(operand)
    .returnType<V.Evaluated>()
    .with({ type: "ref" }, (ref) => evaluateRef(context, scope, ref))
    .with({ type: "quantity" }, (quantity) => {
      const base = toBase(context.vocabulary, D.exact(quantity.value), quantity.unit)
      return base ? numberValue(V.point(base.value), base.dimension) : V.unknown
    })
    .with({ type: "fraction" }, ({ numerator, denominator }) =>
      numberValue(V.point(D.fraction(numerator, denominator)))
    )
    .with({ type: "number" }, (number) => numberValue(V.point(D.exact(number.value))))
    .with({ type: "value" }, ({ term }) => V.known({ type: "term", term, text: context.vocabulary.label(term) }))
    .with({ type: "boolean" }, (boolean) => V.known(boolean))
    .with({ type: "date" }, (date) => V.known({ type: "date", range: V.point(D.integer(toDay(date.value))) }))
    .with({ type: "time" }, (time) => V.known({ type: "time", minutes: minutesOf(time.value) }))
    .with({ type: "governing-date" }, () => V.known({ type: "date", range: V.point(D.integer(context.governingDay)) }))
    .with({ type: "sum" }, ({ of }) =>
      combine(
        of.map((item) => evaluateOperand(context, scope, item)),
        fold(V.addRanges),
        null
      )
    )
    .with({ type: P.union("greatest", "least") }, (extreme) => {
      const step = extreme.type === "greatest" ? V.greatestRange : V.leastRange
      return combine(
        extreme.of.map((item) => evaluateOperand(context, scope, item)),
        fold(step),
        fold(step)
      )
    })
    .with({ type: P.union("difference", "product", "quotient") }, (arithmetic) => {
      const [a, b] = arithmetic.of.map((item) => evaluateOperand(context, scope, item))
      const left = a && asNumber(a)
      const right = b && asNumber(b)
      if (!left || !right) {
        return V.unknown
      }
      return match(arithmetic.type)
        .with("difference", () =>
          numberValue(V.subtractRanges(left.range, right.range), left.dimension ?? right.dimension)
        )
        .with("product", () =>
          numberValue(V.multiplyRanges(left.range, right.range), left.dimension ?? right.dimension)
        )
        .with("quotient", () => {
          const isRatio = left.dimension !== null && left.dimension === right.dimension
          return numberValue(V.divideRanges(left.range, right.range), isRatio ? null : left.dimension)
        })
        .exhaustive()
    })
    .with({ type: P.union("count", "sum-of", "greatest-of", "least-of") }, (operand) =>
      aggregate(context, scope, operand)
    )
    .with({ type: "shift" }, (shift) => {
      const of = asTemporal(evaluateOperand(context, scope, shift.of))
      return of ? shiftTemporal(context, of, shift.by) : V.unknown
    })
    .exhaustive()
}
