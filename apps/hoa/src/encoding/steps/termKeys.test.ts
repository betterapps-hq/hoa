import { describe, expect, it } from "vitest"
import { termDraft } from "@/schema/zod"
import { keySegment, segmentForms, termKeyBuilder } from "./termKeys"

// Term keys built from labels: the same label always gives the same readable key, collisions get a numeric suffix,
// and references by label or key resolve through the same normalization.

const labels = (text: string, alternatives: string[] = []) => ({ preferred: { text, plural: null }, alternatives })

describe("keySegment", () => {
  it.each([
    ["Shared Driveways", "shared-driveway"],
    ["Owner's Lot", "owners-lot"],
    ['Class "B" Member', "class-b-member"],
    ["By-Laws", "by-law"],
    ["Café Areas", "cafe-area"],
    ["  Rules & Regulations ", "rules-regulation"],
    ["HOA", "hoa"],
    ["Age in Years", "age-in-year"],
    ["fence-run", "fence-run"]
  ])("%s keys as %s", (label, key) => {
    expect(keySegment(label)).toBe(key)
  })

  it("is empty for a label with no letter or digit, and lists both forms of a plural", () => {
    expect(keySegment("“—”")).toBe("")
    expect(segmentForms("Common Areas")).toEqual(["common-area", "common-areas"])
  })
})

describe("termKeyBuilder", () => {
  it("builds top-level and child keys, suffixing a taken key and reporting it", () => {
    const keys = termKeyBuilder()
    expect(keys.build(labels("Garden Plots"), null, "thing")).toBe("garden-plot")
    expect(keys.build(labels("Garden Plot"), null, "category")).toBe("garden-plot-2")
    expect(keys.build(labels("Owner"), null, "thing")).toBe("owner-2")
    expect(keys.build(labels("Plot Size"), "garden-plot", "property")).toBe("garden-plot.plot-size")
    expect(keys.build(labels("?!"), null, "thing")).toBeNull()
    expect(keys.problems.map((problem) => `${problem.recordKey} ${problem.code}`)).toEqual([
      "garden-plot-2 key-collision",
      "owner-2 key-collision",
      "?! empty-label"
    ])
  })

  it("resolves references by key, label, alternative or plural, each dotted part on its own", () => {
    const shed = termDraft.parse({
      key: "outbuilding",
      kind: "thing",
      nature: "object",
      labels: [{ text: "Storage Shed", role: "preferred" }]
    })
    const keys = termKeyBuilder([shed])
    const set = keys.build(labels("Roof Materials", ["roofing"]), null, "value set")
    keys.build(labels("Slate Tiles"), set, "value")
    keys.build(labels("Roof Material"), "outbuilding", "property")
    expect(keys.resolve("outbuilding")).toBe("outbuilding")
    expect(keys.resolve("storage-sheds.roof-materials")).toBe("outbuilding.roof-material")
    expect(keys.resolve("roofing.slate-tile")).toBe("roof-material.slate-tile")
    expect(keys.resolve("lot")).toBe("lot")
    expect(keys.resolve("gazebo")).toBeNull()
    expect(keys.named("Storage Sheds", "x", "of")).toBe("outbuilding")
    expect(keys.named("Gazebo", "x", "of")).toBeNull()
    expect(keys.problems.map((problem) => problem.code)).toEqual(["unresolved-reference"])
  })

  it("rewrites the term references of a condition and leaves data alone", () => {
    const keys = termKeyBuilder()
    keys.build(labels("Gardens"), null, "thing")
    keys.build(labels("Bed Count"), "garden", "property")
    const condition = {
      type: "all",
      of: [
        {
          type: "compare",
          left: { type: "ref", path: ["gardens.bed-counts"] },
          op: ">",
          right: { type: "number", value: 2 }
        },
        {
          type: "compare",
          left: { type: "ref", path: ["garden.planted-on"] },
          op: "<",
          right: { type: "date", value: "2024-01-01" }
        },
        { type: "text", text: "gardens" }
      ]
    }
    expect(keys.rewrite(condition)).toEqual({
      ...condition,
      of: [{ ...condition.of[0], left: { type: "ref", path: ["garden.bed-count"] } }, condition.of[1], condition.of[2]]
    })
  })
})
