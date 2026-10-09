import { describe, expect, it } from "vitest"
import { parseQuantity, type UnitLabels } from "./quantity"

// Unit labels as the core unit terms give them.
const units: UnitLabels[] = [
  { unit: "inch", labels: ["inch", "inches", "in", '"', "″"], perBase: "1" },
  { unit: "foot", labels: ["foot", "feet", "ft", "'", "′"], perBase: "12" },
  { unit: "usd", labels: ["$", "dollars", "USD"], perBase: "1" }
]

const parse = (text: string) => parseQuantity(text, units)

describe("parseQuantity", () => {
  it.each([
    ["6'", { type: "single", value: 6, unit: "foot" }],
    ["6 ft", { type: "single", value: 6, unit: "foot" }],
    ["6 feet tall", { type: "single", value: 6, unit: "foot" }],
    ['72"', { type: "single", value: 72, unit: "inch" }],
    ["72 inches", { type: "single", value: 72, unit: "inch" }],
    ["6′", { type: "single", value: 6, unit: "foot" }],
    ["72″", { type: "single", value: 72, unit: "inch" }],
    ["six (6) feet", { type: "single", value: 6, unit: "foot" }],
    ["six feet", { type: "single", value: 6, unit: "foot" }],
    ["seventy-two inches", { type: "single", value: 72, unit: "inch" }],
    ["6.5 ft", { type: "single", value: 6.5, unit: "foot" }],
    ["6 1/2 feet", { type: "single", value: 6.5, unit: "foot" }],
    ["six and a half feet", { type: "single", value: 6.5, unit: "foot" }],
    ["$50", { type: "single", value: 50, unit: "usd" }]
  ])("reads %s", (text, expected) => {
    expect(parse(text)).toEqual(expected)
  })

  it.each([
    ["6'-0\"", { type: "single", value: 72, unit: "inch" }],
    ["5' 6\"", { type: "single", value: 66, unit: "inch" }],
    ["5 ft 6 in", { type: "single", value: 66, unit: "inch" }]
  ])("reads the compound %s in the smaller unit", (text, expected) => {
    expect(parse(text)).toEqual(expected)
  })

  it.each([
    ["4 to 6 feet", { type: "range", min: 4, max: 6, unit: "foot" }],
    ["between 4 and 6 feet", { type: "range", min: 4, max: 6, unit: "foot" }],
    ["4-6 ft", { type: "range", min: 4, max: 6, unit: "foot" }],
    ["4' to 6'", { type: "range", min: 4, max: 6, unit: "foot" }],
    ["48 inches to 6 feet", { type: "range", min: 4, max: 6, unit: "foot" }]
  ])("reads the range %s", (text, expected) => {
    expect(parse(text)).toEqual(expected)
  })

  it.each(["", "tall", "6", "height not given", "6 ft or 8 ft"])("refuses %j", (text) => {
    expect(parse(text)).toBeNull()
  })

  it("accepts the same measurement written twice", () => {
    expect(parse("six (6) feet, that is 6'")).toEqual({ type: "single", value: 6, unit: "foot" })
  })
})
