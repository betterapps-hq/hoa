import { describe, expect, it } from "vitest"
import * as D from "@/engine/decimal"
import { createEngineVocabulary } from "@/engine/vocabulary"
import { coreTerms } from "@/schema/coreTerms"
import { checkCount, checkDate, checkQuantity } from "./valueCheck"

// Only core unit terms: inch, foot, usd, percent, calendar and business days.
const vocabulary = createEngineVocabulary(coreTerms)
const units = coreTerms.flatMap((term) => (term.kind === "unit" ? [term.key] : []))
const check = (quote: string | null, value: D.Exact, unit: string, expected = "inch") =>
  checkQuantity(quote, { value, unit }, expected, { vocabulary, units })

describe("checkQuantity", () => {
  it.each([
    ["6'", 6, "foot"],
    ["6 ft", 72, "inch"],
    ["six (6) feet", 6, "foot"],
    ["6'-0\"", 72, "inch"],
    ["6'-0\"", 6, "foot"],
    ["5 ft 6 in", 66, "inch"],
    ["6 feet (72 inches)", 72, "inch"],
    ["6 1/2 feet", 78, "inch"],
    // The words needn't name the unit: a form's "Height (ft): 6".
    ["6", 6, "foot"]
  ])("verifies %s as %d %s", (quote, value, unit) => {
    expect(check(quote, D.integer(value), unit)).toEqual([])
  })

  it("verifies money and fractions exactly", () => {
    expect(check("$1,250.50", D.exact("1250.5"), "usd", "usd")).toEqual([])
    expect(check("two-thirds (2/3)", D.fraction(200, 3), "percent", "percent")).toEqual([])
    expect(check("two-thirds", D.exact("66.67"), "percent", "percent")).toEqual(["numeral-disagrees"])
  })

  it("rejects a value its numerals don't give", () => {
    expect(check("6 ft", D.integer(8), "foot")).toEqual(["numeral-disagrees"])
    expect(check("4 to 6 feet", D.integer(6), "foot")).toEqual(["numeral-disagrees"])
    expect(check("6 ft, Type 2", D.integer(6), "foot")).toEqual(["numeral-disagrees"])
  })

  it("rejects a value with no words to check, or a unit of another dimension", () => {
    expect(check(null, D.integer(6), "foot")).toEqual(["no-quote"])
    expect(check("tall", D.integer(6), "foot")).toEqual(["no-numeral"])
    expect(check("$6", D.integer(6), "usd")).toEqual(["unit-dimension"])
  })

  it("reads a unit that converts to nothing only in itself", () => {
    expect(
      checkQuantity("10 business days", { value: D.integer(10), unit: "business-day" }, "business-day", {
        vocabulary,
        units
      })
    ).toEqual([])
  })
})

describe("checkCount", () => {
  it("accepts a count its numerals give, or one counted from a drawing", () => {
    expect(checkCount("three (3) gates", 3)).toEqual([])
    expect(checkCount(null, 2)).toEqual([])
    expect(checkCount("a pair", 2)).toEqual([])
    expect(checkCount("3 gates", 2)).toEqual(["numeral-disagrees"])
  })
})

describe("checkDate", () => {
  it.each(["09/04/26", "September 4, 2026", "Sept. 4", "2026-09-04", "4th of Sept"])("verifies %s", (quote) => {
    expect(checkDate(quote, "2026-09-04")).toEqual([])
  })

  it("rejects a date its words don't give", () => {
    expect(checkDate("October 4, 2026", "2026-09-04")).toEqual(["numeral-disagrees"])
    expect(checkDate("09/05/26", "2026-09-04")).toEqual(["numeral-disagrees"])
    expect(checkDate("last week", "2026-09-04")).toEqual(["no-numeral"])
    expect(checkDate(null, "2026-09-04")).toEqual(["no-quote"])
  })
})
