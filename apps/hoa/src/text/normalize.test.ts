import { describe, expect, it } from "vitest"
import { labelForms, pluralOf, singularOf } from "./normalize"

describe("pluralOf", () => {
  it.each([
    ["fence run", "fence runs"],
    ["fence", "fences"],
    ["bush", "bushes"],
    ["box", "boxes"],
    ["property", "properties"],
    ["day", "days"]
  ])("%s becomes %s", (singular, plural) => {
    expect(pluralOf(singular)).toBe(plural)
  })
})

describe("singularOf", () => {
  it.each([
    ["runs", "run"],
    ["fences", "fence"],
    ["bushes", "bush"],
    ["boxes", "box"],
    ["classes", "class"],
    ["churches", "church"],
    ["properties", "property"],
    ["days", "day"],
    ["houses", "house"],
    ["People", "person"],
    ["criteria", "criterion"]
  ])("%s becomes %s", (plural, singular) => {
    expect(singularOf(plural)).toBe(singular)
  })

  it.each(["fence", "status", "analysis", "address", "gas", "HOAS", "series", "Bylaw"])(
    "leaves %s as it is",
    (word) => {
      expect(singularOf(word)).toBe(word)
    }
  )

  it("undoes pluralOf for regular nouns", () => {
    for (const word of ["fence", "bush", "box", "property", "day", "lot", "church"]) {
      expect(singularOf(pluralOf(word))).toBe(word)
    }
  })
})

describe("labelForms", () => {
  it("normalizes the label and its generated plural", () => {
    expect(labelForms({ text: "Common  Area’s", plural: null })).toEqual(["common area s", "common area ses"])
    expect(labelForms({ text: "Fence Run" })).toEqual(["fence run", "fence runs"])
  })

  it("uses the stored plural instead of a generated one", () => {
    expect(labelForms({ text: "Person", plural: "People" })).toEqual(["person", "people"])
  })

  it("lists a form once", () => {
    expect(labelForms({ text: "Sheep", plural: "sheep" })).toEqual(["sheep"])
  })
})
