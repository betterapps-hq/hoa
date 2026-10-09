import { describe, expect, it } from "vitest"
import { labelForms, pluralOf } from "./normalize"

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
