import { describe, expect, it } from "vitest"
import { assertWorkOf, doesWorkOf, navigationFor } from "./roles"

const board = { name: "Board of Directors", kind: "board" } as const
const design = { name: "Design Review", kind: "architectural" } as const
const social = { name: "Social Committee", kind: "other" } as const

const sectionsOf = (...args: Parameters<typeof navigationFor>) =>
  navigationFor(...args).map((section) => [section.label, section.items.map((item) => item.title)])

describe("navigationFor", () => {
  it("gives a homeowner the association's pages only", () => {
    expect(sectionsOf("homeowner", [])).toEqual([
      [null, ["Dashboard"]],
      ["Organization", ["Applications", "Rulebook"]]
    ])
  })

  it("gives each committee they sit on a section with its pages after the organization's, and skips one without", () => {
    expect(sectionsOf("homeowner", [social, board, design])).toEqual([
      [null, ["Dashboard"]],
      ["Organization", ["Rulebook", "People"]],
      ["Design Review", ["Applications", "Project types"]]
    ])
  })

  it("puts a page under the first committee that works in it", () => {
    const second = { name: "Landscape Review", kind: "architectural" } as const
    expect(sectionsOf("homeowner", [design, second])).toEqual([
      [null, ["Dashboard"]],
      ["Organization", ["Rulebook"]],
      ["Design Review", ["Applications", "Project types"]]
    ])
  })

  it("gives an administrator every page, under the association's when no committee has it", () => {
    expect(sectionsOf("administrator", [])).toEqual([
      [null, ["Dashboard"]],
      ["Organization", ["Applications", "Project types", "Rulebook", "People", "Settings"]]
    ])
  })
})

describe("doesWorkOf", () => {
  it("lets an administrator or someone on a committee of the kind do its work", () => {
    expect(doesWorkOf("administrator", [], "board")).toBe(true)
    expect(doesWorkOf("homeowner", [board], "board")).toBe(true)
    expect(doesWorkOf("homeowner", [design], "board")).toBe(false)
  })

  it("says who can when someone can't", () => {
    expect(() => assertWorkOf("homeowner", [social], "architectural")).toThrow(
      "Only the architectural committee or an administrator can do this."
    )
  })
})
