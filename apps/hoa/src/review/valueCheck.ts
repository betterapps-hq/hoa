import * as D from "@/engine/decimal"
import type { EngineVocabulary } from "@/engine/vocabulary"
import type * as T from "@/schema/types"
import { monthOf } from "@/text/date"
import { numeralsIn } from "@/text/numerals"

// The generic verifier (application-review.md, Recognition): the model proposes a value with the exact words it read
// it from, and code checks the proposal with no rule for any one format. Every numeral in the quote must agree with
// the value (in any unit of its dimension, or as a compound such as 6'-0"), and the unit must be one of the dimension
// the property expects. A check returns the problems it found; none means verified.

export const valueProblems = ["no-quote", "no-numeral", "numeral-disagrees", "unit-dimension"] as const
export type ValueProblem = (typeof valueProblems)[number]

/** An exact amount in a unit term. */
export type ExactQuantity = { value: D.Exact; unit: T.TermKey }

/** Whether a quote names a unit by one of its labels: a word as a whole word ("ft", "yards"), a symbol anywhere (″, $). */
function isNamed(quote: string, labels: readonly string[]) {
  const text = quote.toLowerCase()
  return labels.some((label) => {
    const word = label.toLowerCase()
    return /^[\p{L} ]+$/u.test(word) ? new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, "u").test(text) : text.includes(word)
  })
}

/**
 * The sizes, in the dimension's base, a value of this unit can be written in: the converting units the quote names, or
 * every converting unit and the base when it names none. Only named units count where there are some, so that with many
 * units a stray numeral ("6 ft, Type 2") can't agree by coincidence (2 yards are 6 feet).
 */
function sizesOf(vocabulary: EngineVocabulary, units: readonly T.TermKey[], unit: T.TermKey, quote: string) {
  const found = vocabulary.unit(unit)
  if (!found?.perBase) {
    return { amount: null, sizes: [] }
  }
  const converting = units.filter((key) => {
    const other = vocabulary.unit(key)
    return other?.dimension === found.dimension && other.perBase
  })
  const named = converting.filter((key) => isNamed(quote, vocabulary.get(key)?.labels.map((label) => label.text) ?? []))
  const sizes = (named.length > 0 ? named : converting).flatMap((key) => {
    const perBase = vocabulary.unit(key)?.perBase
    return perBase ? [perBase] : []
  })
  const unique = [...(named.length > 0 ? [] : [D.integer(1)]), ...sizes].filter(
    (size, index, all) => all.findIndex((other) => D.compare(other, size) === 0) === index
  )
  return { amount: found.perBase, sizes: unique.toSorted((a, b) => D.compare(b, a)) }
}

const isEqual = (a: D.Exact, b: D.Exact) => D.compare(a, b) === 0

/** Whether numerals, in order and in strictly smaller units each, add up to the amount ("6'-0\"", "5 ft 6 in"). */
function isCompound(numerals: readonly D.Exact[], sizes: readonly D.Exact[], amount: D.Exact): boolean {
  const [first, ...rest] = numerals
  if (!first) {
    return D.isZero(amount)
  }
  return sizes.some((size, index) =>
    isCompound(rest, sizes.slice(index + 1), D.subtract(amount, D.multiply(first, size)))
  )
}

/** Whether a quote's numerals agree with an amount: each one alone in some unit, or all together as a compound. */
function numeralsAgree(numerals: readonly D.Exact[], amount: D.Exact, sizes: readonly D.Exact[]) {
  const inSize = (numeral: D.Exact) => sizes.some((size) => isEqual(D.multiply(numeral, size), amount))
  return numerals.every(inSize) || (numerals.length > 1 && isCompound(numerals, sizes, amount))
}

/** Checks a proposed quantity against its quote and the unit the property is stored in. */
export function checkQuantity(
  quote: string | null,
  proposed: ExactQuantity,
  expectedUnit: T.TermKey,
  context: { vocabulary: EngineVocabulary; units: readonly T.TermKey[] }
): ValueProblem[] {
  const { vocabulary } = context
  const dimension = vocabulary.unit(proposed.unit)?.dimension
  if (dimension === undefined || dimension !== vocabulary.unit(expectedUnit)?.dimension) {
    return ["unit-dimension"]
  }
  if (quote === null) {
    return ["no-quote"]
  }
  const numerals = numeralsIn(quote)
  if (numerals.length === 0) {
    return ["no-numeral"]
  }
  const { amount, sizes } = sizesOf(vocabulary, context.units, proposed.unit, quote)
  // A unit that converts to nothing (business days) is only written in itself.
  const isAgreeing =
    amount === null
      ? numerals.every((numeral) => isEqual(numeral, proposed.value))
      : numeralsAgree(numerals, D.multiply(proposed.value, amount), sizes)
  return isAgreeing ? [] : ["numeral-disagrees"]
}

/** Checks a proposed count: the numerals its quote writes, if any, are that count (a drawing's count has none). */
export function checkCount(quote: string | null, count: number): ValueProblem[] {
  const numerals = quote === null ? [] : numeralsIn(quote)
  return numerals.every((numeral) => isEqual(numeral, D.integer(count))) ? [] : ["numeral-disagrees"]
}

/** Checks a proposed date: every number its quote writes is its day, month or year, and every month it names, its month. */
export function checkDate(quote: string | null, date: T.IsoDate): ValueProblem[] {
  if (quote === null) {
    return ["no-quote"]
  }
  const [year = 0, month = 0, day = 0] = date.split("-").map(Number)
  const numbers = [...quote.matchAll(/\d+/g)].map((match) => Number(match[0]))
  const months = [...quote.matchAll(/[a-z]+/gi)].map((match) => monthOf(match[0])).filter((found) => found > 0)
  if (numbers.length === 0 && months.length === 0) {
    return ["no-numeral"]
  }
  const parts = [day, month, year, year % 100]
  const isAgreeing = numbers.every((number) => parts.includes(number)) && months.every((named) => named === month)
  return isAgreeing ? [] : ["numeral-disagrees"]
}
