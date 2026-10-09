import { describe, expect, it } from "vitest"
import { chunk, insertChunks } from "./batching"
import { provisions } from "./schema"

describe("batching", () => {
  it("splits items into groups of a size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 2)).toEqual([])
  })

  it("fits each insert in D1's 100 bound parameters", () => {
    // provisions has 8 columns: 12 rows to an insert.
    const groups = insertChunks(
      provisions,
      Array.from({ length: 25 }, (_, index) => index)
    )
    expect(groups.map((rows) => rows.length)).toEqual([12, 12, 1])
  })
})
