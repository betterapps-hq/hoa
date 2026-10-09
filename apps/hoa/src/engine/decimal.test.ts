import { describe, expect, it } from "vitest"
import * as D from "./decimal"

const equal = (a: D.Exact, b: D.Exact) => D.compare(a, b) === 0

describe("exact decimals and fractions", () => {
  it("parses decimals exactly, including a JavaScript number's shortest form", () => {
    expect(D.exact("72")).toEqual({ numerator: 72n, denominator: 1n })
    expect(D.exact("-0.01")).toEqual({ numerator: -1n, denominator: 100n })
    expect(D.exact("1e-3")).toEqual({ numerator: 1n, denominator: 1000n })
    expect(D.exact("2.5E2")).toEqual({ numerator: 250n, denominator: 1n })
    expect(D.exact(0.1)).toEqual({ numerator: 1n, denominator: 10n })
    expect(() => D.exact("six")).toThrow("not a decimal")
    expect(() => D.exact(".")).toThrow("not a decimal")
  })

  it("keeps fractions exact and reduced", () => {
    expect(D.fraction(2, 6)).toEqual({ numerator: 1n, denominator: 3n })
    expect(D.fraction(1, -2)).toEqual({ numerator: -1n, denominator: 2n })
    expect(equal(D.add(D.fraction(1, 3), D.fraction(1, 3)), D.fraction(2, 3))).toBe(true)
    expect(() => D.divide(D.integer(1), D.zero)).toThrow("division by zero")
  })

  it("converts units by perBase: 72 inches are 6 feet", () => {
    const foot = D.exact("12")
    expect(equal(D.multiply(D.integer(6), foot), D.exact(72))).toBe(true)
    expect(equal(D.divide(D.exact(72), foot), D.integer(6))).toBe(true)
  })

  it("converts percents: 20 percent is one fifth", () => {
    expect(equal(D.multiply(D.integer(20), D.exact("0.01")), D.fraction(1, 5))).toBe(true)
  })

  it("rounds half up to the cent, away from zero", () => {
    expect(D.roundHalfUp(D.exact("10.125"), 2)).toEqual(D.exact("10.13"))
    expect(D.roundHalfUp(D.exact("-10.125"), 2)).toEqual(D.exact("-10.13"))
    expect(D.roundHalfUp(D.exact("10.124"), 2)).toEqual(D.exact("10.12"))
    expect(D.roundHalfUp(D.fraction(2, 3), 2)).toEqual(D.exact("0.67"))
  })

  it("compares, subtracts, floors and leaves the engine as a number", () => {
    expect(D.compare(D.fraction(1, 3), D.exact("0.33"))).toBe(1)
    expect(D.compare(D.exact("0.33"), D.fraction(1, 3))).toBe(-1)
    expect(D.isZero(D.subtract(D.exact(5), D.integer(5)))).toBe(true)
    expect(D.isNegative(D.negate(D.integer(1)))).toBe(true)
    expect(D.floor(D.exact("-1.5"))).toBe(-2n)
    expect(D.floor(D.exact("1.5"))).toBe(1n)
    expect(D.floor(D.integer(-2))).toBe(-2n)
    expect(D.toNumber(D.fraction(1, 4))).toBe(0.25)
  })
})
