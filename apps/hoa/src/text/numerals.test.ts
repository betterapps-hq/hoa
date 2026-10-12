import { describe, expect, it } from "vitest"
import * as D from "@/engine/decimal"
import { numeralsIn } from "./numerals"

const read = (text: string) => numeralsIn(text).map((value) => `${value.numerator}/${value.denominator}`)

describe("numeralsIn", () => {
  it.each([
    ["6", ["6/1"]],
    ["1,000", ["1000/1"]],
    ["$1,250.50", ["2501/2"]],
    [".5", ["1/2"]],
    ["6 1/2 feet", ["13/2"]],
    ["6-1/2", ["13/2"]],
    ["6½", ["13/2"]],
    ["2/3", ["2/3"]],
    ["⅔", ["2/3"]],
    ["six (6) feet", ["6/1", "6/1"]],
    ["seventy-two inches", ["72/1"]],
    ["one hundred and five", ["105/1"]],
    ["six and a half feet", ["13/2"]],
    ["two-thirds", ["2/3"]],
    ["two thirds of the lots", ["2/3"]],
    ["a quarter", ["1/4"]],
    ["half an inch", ["1/2"]],
    ["6'-0\"", ["6/1", "0/1"]],
    ["5 ft 6 in", ["5/1", "6/1"]]
  ])("reads %s", (text, expected) => {
    expect(read(text)).toEqual(expected)
  })

  it("reads two numbers joined by and as two", () => {
    expect(read("between four and six feet")).toEqual(["4/1", "6/1"])
  })

  it("skips numerals glued to a word and words that aren't numbers", () => {
    expect(read("Type R2 panels, someone said")).toEqual([])
    expect(read("tall")).toEqual([])
  })

  it("reads exactly", () => {
    const [third] = numeralsIn("one third")
    expect(third && D.compare(third, D.fraction(1, 3))).toBe(0)
  })
})
