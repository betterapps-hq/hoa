import { describe, expect, it } from "vitest"
import { withLawFirst } from "./law"

describe("withLawFirst", () => {
  it("puts law first in its own ranks, whatever order the documents give", () => {
    expect(
      withLawFirst([["declaration", "state-law"], ["bylaws"], ["city-ordinance"], ["federal-law", "rules"]])
    ).toEqual([
      ["federal-law"],
      ["state-law"],
      ["county-ordinance", "city-ordinance"],
      ["declaration"],
      ["bylaws"],
      ["rules"]
    ])
  })
})
