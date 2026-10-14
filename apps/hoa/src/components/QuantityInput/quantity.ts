import * as D from "@/engine/decimal"
import type { UnitSystem } from "@/organization/organization"
import { readNumeral } from "@/text/numerals"

// How the shared quantity inputs lay out an amount and convert it (docs/ux.md, Forms): chosen by what the amount
// measures, in the organization's unit system, from the units the vocabulary has. Values convert exactly (the
// rulebook's decimals) and are stored in the property's own unit.

export type { UnitSystem }

/** A unit as the vocabulary gives it: its key, labels and size in its dimension's base; null when it doesn't convert. */
export type QuantityUnit = { unit: string; labels: readonly string[]; perBase: string | null }

/** What an amount is: its own unit (null for a count), what it measures, and the units it can be given in. */
export type QuantitySpec = {
  unit: { key: string; label: string } | null
  dimension: string | null
  units: readonly QuantityUnit[]
}

/** One box of an input: the unit it's in and what it's called. */
export type QuantityBox = { unit: QuantityUnit; name: string; isPrefix: boolean }

export type QuantityLayout =
  | { type: "count" }
  /** A larger and a smaller unit side by side: feet and inches, meters and centimeters. */
  | { type: "compound"; major: QuantityBox; minor: QuantityBox }
  /** A number with a choice of unit: days, weeks, months. */
  | { type: "duration"; boxes: QuantityBox[] }
  | { type: "single"; box: QuantityBox }

// The international system's unit symbols and names. A unit with one of these labels is metric; any other is imperial.
const metricLabels = new Set([
  "mm",
  "cm",
  "m",
  "km",
  "m2",
  "m²",
  "sq m",
  "ha",
  "m3",
  "m³",
  "l",
  "ml",
  "g",
  "kg",
  "millimeter",
  "millimeters",
  "centimeter",
  "centimeters",
  "meter",
  "meters",
  "metre",
  "metres",
  "kilometer",
  "kilometers",
  "square meter",
  "square meters",
  "hectare",
  "hectares",
  "liter",
  "liters",
  "kilogram",
  "kilograms"
])

/** The ratio between the two boxes of a compound length in each system: 12 inches to the foot, 100 cm to the meter. */
const compoundRatio: Record<UnitSystem, bigint> = { imperial: 12n, metric: 100n }

const durationDimensions = new Set(["elapsed-time", "calendar-period", "business-time"])

export const systemOf = (unit: QuantityUnit): UnitSystem =>
  unit.labels.some((label) => metricLabels.has(label.toLowerCase())) ? "metric" : "imperial"

const isWord = (label: string) => /^\p{L}[\p{L} ]*$/u.test(label)

/** A box's short name: its shortest label in letters ("ft"), or a symbol such as "$" or "%", which isn't a word. */
function boxOf(unit: QuantityUnit, fallback: string): QuantityBox {
  const words = unit.labels.filter(isWord).toSorted((a, b) => a.length - b.length)
  const symbol = unit.labels.find((label) => /^[^\p{L}\p{N}\s'"″′]+$/u.test(label))
  if (words.length === 0 && symbol) {
    return { unit, name: symbol, isPrefix: symbol !== "%" }
  }
  return { unit, name: words[0] ?? fallback, isPrefix: false }
}

const sizeOf = (unit: QuantityUnit) => D.exact(unit.perBase ?? "1")

/** How far apart two units are in size, as a positive number (log scale). */
const distance = (a: QuantityUnit, b: QuantityUnit) =>
  Math.abs(Math.log(D.toNumber(sizeOf(a))) - Math.log(D.toNumber(sizeOf(b))))

/** The input for an amount: by what it measures, in the organization's system when the vocabulary has its units. */
export function layoutOf(spec: QuantitySpec, system: UnitSystem): QuantityLayout {
  if (!spec.unit) {
    return { type: "count" }
  }
  const ownLabel = spec.unit.label
  const own = spec.units.find((unit) => unit.unit === spec.unit?.key) ?? {
    unit: spec.unit.key,
    labels: [ownLabel],
    perBase: null
  }
  const convertible = own.perBase === null ? [] : spec.units.filter((unit) => unit.perBase !== null)
  if (spec.dimension !== null && durationDimensions.has(spec.dimension)) {
    const units = convertible.length > 0 ? convertible.toSorted((a, b) => D.compare(sizeOf(a), sizeOf(b))) : [own]
    return { type: "duration", boxes: units.map((unit) => boxOf(unit, unit.unit)) }
  }
  const inSystem = convertible.filter((unit) => systemOf(unit) === system)
  const candidates = inSystem.length > 0 ? inSystem : convertible
  if (spec.dimension === "length") {
    const ratio = compoundRatio[candidates[0] ? systemOf(candidates[0]) : system]
    const pairs = candidates.flatMap((major) =>
      candidates.flatMap((minor) => {
        const between = D.divide(sizeOf(major), sizeOf(minor))
        return between.denominator === 1n && between.numerator === ratio ? [{ major, minor }] : []
      })
    )
    const pair = pairs.toSorted((a, b) => distance(a.minor, own) - distance(b.minor, own))[0]
    if (pair) {
      return { type: "compound", major: boxOf(pair.major, pair.major.unit), minor: boxOf(pair.minor, pair.minor.unit) }
    }
  }
  const nearest = candidates.toSorted((a, b) => distance(a, own) - distance(b, own))[0]
  const unit = candidates.includes(own) ? own : (nearest ?? own)
  return { type: "single", box: boxOf(unit, unit === own ? ownLabel : unit.unit) }
}

/** A box's text as an exact number: digits, a decimal or a fraction ("11.5", "11 1/2"); null when it isn't one. */
export function readBox(text: string): D.Exact | null {
  const trimmed = text.trim()
  if (trimmed === "") {
    return D.zero
  }
  const numeral = readNumeral(trimmed)
  return numeral && numeral.length === trimmed.length && !D.isNegative(numeral.value) ? numeral.value : null
}

/** Places an amount keeps once converted: enough for a sixteenth of an inch, without float noise. */
const places = 4

/**
 * The amount the boxes give, in the property's own unit: each box's number times its unit's size, over the own
 * unit's size, exactly. Null when every box is blank; "unreadable" when a box isn't a number.
 */
export function toValue(
  entries: readonly { text: string; unit: QuantityUnit }[],
  own: QuantityUnit | null
): number | null | "unreadable" {
  if (entries.every((entry) => entry.text.trim() === "")) {
    return null
  }
  let total = D.zero
  for (const entry of entries) {
    const read = readBox(entry.text)
    if (read === null) {
      return "unreadable"
    }
    const scale = own && own.unit !== entry.unit.unit ? D.divide(sizeOf(entry.unit), sizeOf(own)) : D.integer(1)
    total = D.add(total, D.multiply(read, scale))
  }
  return D.toNumber(D.roundHalfUp(total, places))
}

const text = (value: D.Exact) => String(D.toNumber(D.roundHalfUp(value, places)))

/** A stored amount as the boxes show it: 71.5 inches as 5 feet and 11.5 inches. */
export function toBoxes(value: number | null, layout: QuantityLayout, own: QuantityUnit | null): string[] {
  if (value === null) {
    return layout.type === "compound" ? ["", ""] : [""]
  }
  const amount = D.exact(value)
  const inUnit = (unit: QuantityUnit) =>
    own && own.unit !== unit.unit ? D.divide(D.multiply(amount, sizeOf(own)), sizeOf(unit)) : amount
  switch (layout.type) {
    case "compound": {
      const minors = inUnit(layout.minor.unit)
      const ratio = D.divide(sizeOf(layout.major.unit), sizeOf(layout.minor.unit))
      const majors = D.integer(D.floor(D.divide(minors, ratio)))
      const rest = D.subtract(minors, D.multiply(majors, ratio))
      return [text(majors), text(rest)]
    }
    case "duration":
      return [text(amount)]
    case "single":
      return [text(inUnit(layout.box.unit))]
    default:
      return [text(amount)]
  }
}
