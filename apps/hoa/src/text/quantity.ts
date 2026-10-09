// The quantity grammar (application-review.md, Language processing): the forms applications use for measurements,
// together. Digits, decimals and fractions ("6", "6.5", "6 1/2"), number words ("six", "seventy-two"), the legal double
// form ("six (6)"), feet and inch marks ("6'", "72\"", "6′", "72″"), compounds ("6'-0\"", "5 ft 6 in") and ranges
// ("4 to 6 feet", "between 4 and 6 feet", "4-6 ft"). Unit labels come from the rulebook's unit terms, so the grammar
// knows no unit of its own.

/** A unit term as the grammar reads it: its key, every label (marks included), and its size in its dimension's base. */
export type UnitLabels = { unit: string; labels: readonly string[]; perBase: string | null }

export type Quantity = { value: number; unit: string }
export type ParsedQuantity = ({ type: "single" } & Quantity) | { type: "range"; min: number; max: number; unit: string }

type Token =
  | { type: "number"; value: number }
  | { type: "unit"; unit: UnitLabels }
  | { type: "connector"; word: "to" | "and" | "between" | "dash" }
  | { type: "other" }

const ones: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19
}
const tens: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
}
const vulgarFractions: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75 }

/** Curly quotes and primes as the plain marks unit labels use. */
function plainMarks(text: string) {
  return text.replace(/[′’‘]/g, "'").replace(/[″“”]/g, '"')
}

const digitNumber = /^(\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)(?:(?:\s+|-)(\d+)\/(\d+))?([¼½¾])?/
const fractionOnly = /^(\d+)\/(\d+)/
const wordPattern = /^[a-z]+/
const isLetter = (character: string | undefined) => character !== undefined && /[a-z]/.test(character)

/** Reads a run of number words ("seventy-two", "one hundred and five", "six and a half"). */
function readWords(text: string): { value: number; length: number } | null {
  let position = 0
  let total = 0
  let current = 0
  let isFound = false
  let length = 0
  for (;;) {
    const rest = text.slice(position)
    const separator = /^[\s-]*/.exec(rest)?.[0] ?? ""
    const word = wordPattern.exec(rest.slice(separator.length))?.[0]
    if (!word) {
      break
    }
    const next = position + separator.length + word.length
    if (word in ones) {
      current += ones[word] ?? 0
    } else if (word in tens) {
      current += tens[word] ?? 0
    } else if (word === "hundred" && isFound) {
      current = (current || 1) * 100
    } else if (word === "thousand" && isFound) {
      total += (current || 1) * 1000
      current = 0
    } else if (word === "and" && isFound && /^\s+a\s+half\b/.test(text.slice(next))) {
      const half = /^\s+a\s+half/.exec(text.slice(next))?.[0] ?? ""
      current += 0.5
      position = next + half.length
      length = position
      break
    } else if (word === "and" && isFound) {
      position = next
      continue
    } else {
      break
    }
    isFound = true
    position = next
    length = position
  }
  return isFound ? { value: total + current, length } : null
}

function toNumber(digits: string) {
  return Number(digits.replaceAll(",", ""))
}

const connectors: Record<string, Token> = {
  to: { type: "connector", word: "to" },
  through: { type: "connector", word: "to" },
  and: { type: "connector", word: "and" },
  between: { type: "connector", word: "between" }
}
const connectorOf = (word: string): Token => connectors[word] ?? { type: "other" }

/** Splits a text into numbers, unit labels after numbers, range connectors and everything else. */
function tokenize(source: string, units: readonly UnitLabels[]): Token[] {
  const text = plainMarks(source.toLowerCase())
  const labels = units
    .flatMap((unit) => unit.labels.map((label) => ({ unit, label: plainMarks(label.toLowerCase()) })))
    .toSorted((a, b) => b.label.length - a.label.length)
  // A symbol label written before its number: "$50".
  const prefixes = labels.filter(({ label }) => /^[^\p{L}\p{N}'"\s]+$/u.test(label))
  const tokens: Token[] = []
  let prefix: UnitLabels | null = null
  const pushNumber = (value: number) => {
    tokens.push({ type: "number", value })
    if (prefix) {
      tokens.push({ type: "unit", unit: prefix })
      prefix = null
    }
  }
  let position = 0
  while (position < text.length) {
    const rest = text.slice(position)
    const space = /^\s+/.exec(rest)?.[0]
    if (space) {
      position += space.length
      continue
    }
    const previous = tokens.at(-1)
    if (previous?.type === "number") {
      const found = labels.find(
        ({ label }) => rest.startsWith(label) && !(isLetter(label.at(-1)) && isLetter(rest.charAt(label.length)))
      )
      if (found) {
        tokens.push({ type: "unit", unit: found.unit })
        position += found.label.length
        continue
      }
      // The legal double form: "six (6)" is one number.
      const doubled = /^\((\d+(?:\.\d+)?)\)/.exec(rest)
      if (doubled?.[1]) {
        previous.value = toNumber(doubled[1])
        position += doubled[0].length
        continue
      }
    }
    const symbol = prefixes.find(({ label }) => rest.startsWith(label))
    if (symbol) {
      prefix = symbol.unit
      position += symbol.label.length
      continue
    }
    const digits = digitNumber.exec(rest)
    if (digits?.[1] && !isLetter(text.charAt(position - 1))) {
      const whole = toNumber(digits[1])
      const fraction = digits[2] && digits[3] ? Number(digits[2]) / Number(digits[3]) : 0
      pushNumber(whole + fraction + (vulgarFractions[digits[4] ?? ""] ?? 0))
      position += digits[0].length
      continue
    }
    const fraction = fractionOnly.exec(rest)
    if (fraction?.[1] && fraction[2]) {
      pushNumber(Number(fraction[1]) / Number(fraction[2]))
      position += fraction[0].length
      continue
    }
    if (isLetter(rest.charAt(0)) && !isLetter(text.charAt(position - 1))) {
      const words = readWords(rest)
      if (words) {
        pushNumber(words.value)
        position += words.length
        continue
      }
      const word = wordPattern.exec(rest)?.[0] ?? rest.charAt(0)
      tokens.push(connectorOf(word))
      position += word.length
      continue
    }
    tokens.push(/^[-–—]/.test(rest) ? { type: "connector", word: "dash" } : { type: "other" })
    position += 1
  }
  return tokens
}

const round = (value: number) => Math.round(value * 1e6) / 1e6

/** Converts a value between two units of one dimension; null when either doesn't convert. */
function convert(value: number, from: UnitLabels, to: UnitLabels) {
  if (from.unit === to.unit) {
    return value
  }
  if (from.perBase === null || to.perBase === null) {
    return null
  }
  return round((value * Number(from.perBase)) / Number(to.perBase))
}

type Measure = { value: number; unit: UnitLabels }

/** A number with its unit, and a smaller unit's amount after it ("6' 0\"", "5 ft 6 in"). */
function readMeasure(tokens: readonly Token[], start: number): { measure: Measure; next: number } | null {
  const number = tokens[start]
  const unit = tokens[start + 1]
  if (number?.type !== "number" || unit?.type !== "unit") {
    return null
  }
  let next = start + 2
  const after = tokens[next]
  const offset = after?.type === "connector" && after.word === "dash" ? 1 : 0
  const smaller = tokens[next + offset]
  const smallerUnit = tokens[next + offset + 1]
  if (smaller?.type === "number" && smallerUnit?.type === "unit") {
    const isSmaller =
      unit.unit.perBase !== null &&
      smallerUnit.unit.perBase !== null &&
      Number(smallerUnit.unit.perBase) < Number(unit.unit.perBase)
    const converted = isSmaller ? convert(number.value, unit.unit, smallerUnit.unit) : null
    if (converted !== null) {
      next += offset + 2
      return { measure: { value: round(converted + smaller.value), unit: smallerUnit.unit }, next }
    }
  }
  return { measure: { value: number.value, unit: unit.unit }, next }
}

/** Every quantity and range in the tokens, in order. */
function readAll(tokens: readonly Token[]): ParsedQuantity[] {
  const found: ParsedQuantity[] = []
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]
    const isBetween = token?.type === "connector" && token.word === "between"
    const start = isBetween ? index + 1 : index
    const first = tokens[start]
    if (first?.type !== "number") {
      index += 1
      continue
    }
    // A range: "4 to 6 feet", "4' to 6'", "between 4 and 6 feet", "4-6 ft".
    const low = readMeasure(tokens, start)
    const afterLow = low ? low.next : start + 1
    const connector = tokens[afterLow]
    const isRangeWord =
      connector?.type === "connector" &&
      (connector.word === "to" || connector.word === "dash" || (isBetween && connector.word === "and"))
    const high = isRangeWord ? readMeasure(tokens, afterLow + 1) : null
    if (high) {
      const min = low ? convert(low.measure.value, low.measure.unit, high.measure.unit) : first.value
      if (min !== null) {
        found.push({ type: "range", min, max: high.measure.value, unit: high.measure.unit.unit })
        index = high.next
        continue
      }
    }
    if (low) {
      found.push({ type: "single", value: low.measure.value, unit: low.measure.unit.unit })
      index = low.next
      continue
    }
    index = start + 1
  }
  return found
}

const isSame = (a: ParsedQuantity, b: ParsedQuantity) => JSON.stringify(a) === JSON.stringify(b)

/**
 * The quantity a text states: one measurement or one range, in the units it names. Null when the text has none, a
 * number without a unit, or several different ones.
 */
export function parseQuantity(text: string, units: readonly UnitLabels[]): ParsedQuantity | null {
  const found = readAll(tokenize(text, units))
  const [first] = found
  return first && found.every((item) => isSame(item, first)) ? first : null
}
