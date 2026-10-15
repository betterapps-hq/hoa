import { describe, expect, it } from "vitest"
import { addressParts, unitNameFrom } from "./address"

const part = (longText: string, type: string, shortText = longText) => ({ longText, shortText, types: [type] })

describe("addressParts", () => {
  it("takes the street, unit, city, state's abbreviation and ZIP code from a place's components", () => {
    expect(
      addressParts([
        part("12", "street_number"),
        part("Lakeview Drive", "route", "Lakeview Dr"),
        part("3B", "subpremise"),
        part("Bellingham", "locality"),
        part("Washington", "administrative_area_level_1", "WA"),
        part("98229", "postal_code"),
        part("United States", "country", "US")
      ])
    ).toEqual({ street: "12 Lakeview Drive", unitNumber: "3B", city: "Bellingham", state: "WA", postalCode: "98229" })
  })

  it("leaves out what the place doesn't have", () => {
    expect(addressParts([part("Lakeview Drive", "route")])).toEqual({
      street: "Lakeview Drive",
      unitNumber: "",
      city: "",
      state: "",
      postalCode: ""
    })
  })
})

describe("unitNameFrom", () => {
  it("names a unit by its house number, with its unit number when it has one", () => {
    expect(unitNameFrom("12 Lakeview Drive", "")).toBe("12")
    expect(unitNameFrom("12 Lakeview Drive", "3B")).toBe("12 #3B")
    expect(unitNameFrom("12A Lakeview Drive", "Apt 3")).toBe("12A Apt 3")
  })

  it("gives no name for an address without a number", () => {
    expect(unitNameFrom("Lakeview Drive", "3B")).toBe("")
  })
})
