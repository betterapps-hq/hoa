import { describe, expect, it } from "vitest"
import * as D from "./decimal"
import * as V from "./values"

const range = (min: number | null, max: number | null): V.Range => ({
  min: min === null ? null : D.exact(min),
  max: max === null ? null : D.exact(max)
})

describe("three-valued logic (schema.md, Expressions 3)", () => {
  it.each([
    [[true, true], true, true],
    [[true, false], false, true],
    [[true, null], null, true],
    [[false, null], false, null],
    [[null, null], null, null],
    [[false, false], false, false]
  ] as const)("all and any of %j", (values, all, any) => {
    expect(V.all([...values])).toBe(all)
    expect(V.any([...values])).toBe(any)
  })

  it("not swaps true and false and leaves unknown", () => {
    expect([V.not(true), V.not(false), V.not(null)]).toEqual([false, true, null])
  })
})

describe("ranges for unknown numbers (Expressions 4)", () => {
  it("decides a comparison only when every value in the ranges agrees", () => {
    // A 95-inch fence fails "fence plus lattice at most 90 inches" even when its lattice height is unknown.
    const total = V.addRanges(V.point(D.integer(95)), V.fromZero)
    expect(V.compareRanges(total, "<=", V.point(D.integer(90)))).toBe(false)
    expect(V.compareRanges(V.fromZero, "<=", V.point(D.integer(72)))).toBeNull()
    expect(V.compareRanges(range(10, 20), "<", range(21, 30))).toBe(true)
    expect(V.compareRanges(range(10, 20), "<", range(20, 30))).toBeNull()
    expect(V.compareRanges(range(10, 20), "<=", range(20, 30))).toBe(true)
    expect(V.compareRanges(range(10, 20), ">", range(1, 9))).toBe(true)
    expect(V.compareRanges(range(10, 20), ">=", range(20, 30))).toBeNull()
  })

  it("tells equal points, disjoint ranges and overlapping ones apart", () => {
    expect(V.compareRanges(range(5, 5), "=", range(5, 5))).toBe(true)
    expect(V.compareRanges(range(5, 5), "!=", range(6, 6))).toBe(true)
    expect(V.compareRanges(range(1, 4), "=", range(5, null))).toBe(false)
    expect(V.compareRanges(range(1, 6), "=", range(5, null))).toBeNull()
    expect(V.isPoint(range(1, 1))).toBe(true)
    expect(V.isPoint(V.fromZero)).toBe(false)
  })

  it("carries ranges through arithmetic", () => {
    expect(V.subtractRanges(range(10, 20), range(1, 2))).toEqual(range(8, 19))
    expect(V.multiplyRanges(V.fromZero, V.point(D.integer(2)))).toEqual(range(0, null))
    expect(V.multiplyRanges(range(-1, 2), range(null, 3))).toEqual(range(null, null))
    expect(V.multiplyRanges(V.point(D.zero), V.anyRange)).toEqual(range(0, 0))
    expect(V.divideRanges(range(10, 20), range(2, 5))).toEqual(range(2, 10))
    expect(V.divideRanges(range(1, 1), range(2, null))).toEqual(range(0, 0.5))
    expect(V.divideRanges(range(1, 2), V.fromZero)).toEqual(range(0, null))
    expect(V.divideRanges(range(-1, 2), V.fromZero)).toEqual(V.anyRange)
    expect(V.negateRange(range(null, 3))).toEqual(range(-3, null))
  })

  it("takes the greater and the lesser of ranges", () => {
    expect(V.greatestRange(range(1, 5), range(3, null))).toEqual(range(3, null))
    expect(V.leastRange(range(1, 5), range(3, null))).toEqual(range(1, 5))
    expect(V.leastRange(range(null, 5), range(3, 4))).toEqual(range(null, 4))
    expect(V.shiftRange(range(1, null), (value) => D.add(value, D.integer(1)))).toEqual(range(2, null))
  })
})
