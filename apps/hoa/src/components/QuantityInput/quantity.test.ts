import { describe, expect, it } from "vitest"
import { layoutOf, readBox, systemOf, toBoxes, toValue, type QuantitySpec } from "./quantity"

// Synthetic vocabularies: lengths on a millimeter base so both systems convert exactly, an area, durations and money.
const inch = { unit: "inch", labels: ["inch", "in", "inches", '"'], perBase: "25.4" }
const foot = { unit: "foot", labels: ["foot", "ft", "feet", "'"], perBase: "304.8" }
const meter = { unit: "meter", labels: ["meter", "m", "meters"], perBase: "1000" }
const centimeter = { unit: "centimeter", labels: ["centimeter", "cm", "centimeters"], perBase: "10" }
const lengths = [inch, foot, meter, centimeter]
const height: QuantitySpec = { unit: { key: "inch", label: "inches" }, dimension: "length", units: lengths }

const squareFoot = { unit: "square-foot", labels: ["square foot", "sq ft"], perBase: "1" }
const squareMeter = { unit: "square-meter", labels: ["square meter", "sq m"], perBase: "10.7639104" }
const day = { unit: "day", labels: ["day", "days"], perBase: "1" }
const week = { unit: "week", labels: ["week", "weeks"], perBase: "7" }
const dollar = { unit: "usd", labels: ["usd", "$", "dollars"], perBase: "1" }

const value = (spec: QuantitySpec, entries: [string, typeof inch][]) =>
  toValue(
    entries.map(([text, unit]) => ({ text, unit })),
    spec.units.find((unit) => unit.unit === spec.unit?.key) ?? null
  )

describe("layoutOf", () => {
  it("gives a length feet and inches, or meters and centimeters, by the organization's system", () => {
    expect(layoutOf(height, "imperial")).toMatchObject({
      type: "compound",
      major: { name: "ft" },
      minor: { name: "in" }
    })
    expect(layoutOf(height, "metric")).toMatchObject({ type: "compound", major: { name: "m" }, minor: { name: "cm" } })
    expect(systemOf(meter)).toBe("metric")
    expect(systemOf(foot)).toBe("imperial")
  })

  it("falls back to the units the vocabulary has when it has none of the system's", () => {
    const imperialOnly = { ...height, units: [inch, foot] }
    expect(layoutOf(imperialOnly, "metric")).toMatchObject({ type: "compound", major: { name: "ft" } })
  })

  it("gives an area one box in the system's unit, a duration a unit to choose, money its symbol first, a count a stepper", () => {
    const area = {
      unit: { key: "square-foot", label: "square feet" },
      dimension: "area",
      units: [squareFoot, squareMeter]
    }
    expect(layoutOf(area, "metric")).toMatchObject({ type: "single", box: { name: "sq m" } })
    const wait = { unit: { key: "day", label: "days" }, dimension: "elapsed-time", units: [week, day] }
    expect(layoutOf(wait, "imperial")).toMatchObject({ type: "duration", boxes: [{ name: "day" }, { name: "week" }] })
    const fee = { unit: { key: "usd", label: "dollars" }, dimension: "money", units: [dollar] }
    expect(layoutOf(fee, "imperial")).toMatchObject({ type: "single", box: { name: "usd", isPrefix: false } })
    expect(layoutOf({ unit: null, dimension: null, units: [] }, "imperial")).toEqual({ type: "count" })
  })
})

describe("toValue and toBoxes", () => {
  it("converts boxes to the property's unit exactly", () => {
    expect(
      value(height, [
        ["6", foot],
        ["0", inch]
      ])
    ).toBe(72)
    expect(
      value(height, [
        ["5", foot],
        ["11.5", inch]
      ])
    ).toBe(71.5)
    expect(
      value(height, [
        ["1", meter],
        ["83", centimeter]
      ])
    ).toBe(72.0472)
    expect(
      value(height, [
        ["1.83", meter],
        ["", centimeter]
      ])
    ).toBe(72.0472)
    expect(
      value(height, [
        ["", foot],
        ["", inch]
      ])
    ).toBeNull()
    expect(
      value(height, [
        ["tall", foot],
        ["", inch]
      ])
    ).toBe("unreadable")
  })

  it("shows a stored amount in the boxes", () => {
    expect(toBoxes(71.5, layoutOf(height, "imperial"), inch)).toEqual(["5", "11.5"])
    expect(toBoxes(72, layoutOf(height, "imperial"), inch)).toEqual(["6", "0"])
    expect(toBoxes(null, layoutOf(height, "imperial"), inch)).toEqual(["", ""])
  })

  it("reads plain numbers and fractions, and nothing negative", () => {
    expect(readBox("11 1/2")).toEqual(readBox("11.5"))
    expect(readBox("-3")).toBeNull()
    expect(readBox("")).toEqual({ numerator: 0n, denominator: 1n })
  })
})
