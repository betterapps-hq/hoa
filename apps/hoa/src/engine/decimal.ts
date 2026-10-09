// Exact numbers: decimals and fractions as reduced bigint ratios, so 72 inches equal 6 feet and two thirds stays two
// thirds. Floats appear only where a value leaves the engine as a FactValue.

export type Exact = { numerator: bigint; denominator: bigint } // denominator positive; reduced

const decimalPattern = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i

function gcd(a: bigint, b: bigint): bigint {
  let [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b]
  while (y !== 0n) {
    ;[x, y] = [y, x % y]
  }
  return x
}

function reduce(numerator: bigint, denominator: bigint): Exact {
  if (denominator === 0n) {
    throw new Error("division by zero")
  }
  const sign = denominator < 0n ? -1n : 1n
  const divisor = gcd(numerator, denominator) || 1n
  return { numerator: (sign * numerator) / divisor, denominator: (sign * denominator) / divisor }
}

/** A decimal written as digits ("72", "-0.01", "1e-3"), or a JavaScript number by its shortest decimal form. */
export function exact(value: number | string): Exact {
  const text = typeof value === "number" ? String(value) : value.trim()
  const parts = decimalPattern.exec(text)
  if (!parts || !(parts[2] || parts[3])) {
    throw new Error(`not a decimal: ${text}`)
  }
  const [, sign = "", whole = "", fractionDigits = "", exponent = "0"] = parts
  const digits = BigInt(`${sign}${whole}${fractionDigits}` || "0")
  const scale = BigInt(fractionDigits.length) - BigInt(exponent)
  return scale >= 0n ? reduce(digits, 10n ** scale) : reduce(digits * 10n ** -scale, 1n)
}

export const integer = (value: number | bigint): Exact => reduce(BigInt(value), 1n)

export const fraction = (numerator: number, denominator: number): Exact =>
  reduce(BigInt(numerator), BigInt(denominator))

export const zero = integer(0)

export const add = (a: Exact, b: Exact) =>
  reduce(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator)

export const negate = (a: Exact): Exact => ({ numerator: -a.numerator, denominator: a.denominator })

export const subtract = (a: Exact, b: Exact) => add(a, negate(b))

export const multiply = (a: Exact, b: Exact) => reduce(a.numerator * b.numerator, a.denominator * b.denominator)

export const divide = (a: Exact, b: Exact) => reduce(a.numerator * b.denominator, a.denominator * b.numerator)

/** -1, 0 or 1 as a is less than, equal to or greater than b. */
export function compare(a: Exact, b: Exact) {
  const difference = a.numerator * b.denominator - b.numerator * a.denominator
  if (difference === 0n) {
    return 0
  }
  return difference < 0n ? -1 : 1
}

export const isZero = (a: Exact) => a.numerator === 0n

export const isNegative = (a: Exact) => a.numerator < 0n

/** Rounded to the given decimal places, halves away from zero: $10.125 is $10.13 and -$10.125 is -$10.13. */
export function roundHalfUp(value: Exact, places: number): Exact {
  const scale = 10n ** BigInt(places)
  const scaled = value.numerator * scale
  const magnitude = scaled < 0n ? -scaled : scaled
  const rounded = (2n * magnitude + value.denominator) / (2n * value.denominator)
  return reduce(scaled < 0n ? -rounded : rounded, scale)
}

/** The whole number at or below the value. */
export function floor(value: Exact) {
  const quotient = value.numerator / value.denominator
  return value.numerator < 0n && quotient * value.denominator !== value.numerator ? quotient - 1n : quotient
}

/** The nearest JavaScript number, for values leaving the engine. */
export const toNumber = (value: Exact) => Number(value.numerator) / Number(value.denominator)
