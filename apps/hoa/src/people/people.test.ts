import { describe, expect, it } from "vitest"
import { nextTermStart, seatInputSchema, seatTermLabel } from "./people"

const seat = { role: "member" as const, office: "" }

describe("seatInputSchema", () => {
  it("takes a term with no days, or one that ends after it starts", () => {
    expect(seatInputSchema.safeParse({ ...seat, startedOn: "", termEndsOn: "" }).success).toBe(true)
    expect(seatInputSchema.parse({ ...seat, startedOn: "2026-06-01", termEndsOn: "2028-05-31" })).toMatchObject({
      startedOn: "2026-06-01",
      termEndsOn: "2028-05-31"
    })
  })

  it("refuses a term that ends before it starts, on its end", () => {
    const result = seatInputSchema.safeParse({ ...seat, startedOn: "2026-06-01", termEndsOn: "2026-05-31" })
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([["termEndsOn"]])
  })
})

describe("seatTermLabel", () => {
  const president = { role: "chair" as const, office: "President" }

  it("says when the term ends, or that it ended while they hold the seat", () => {
    expect(seatTermLabel({ ...president, termEndsOn: "2027-05-31" }, "2026-10-14")).toBe(
      "President, Chair, term ends May 31, 2027"
    )
    expect(seatTermLabel({ ...president, termEndsOn: "2026-05-31" }, "2026-10-14")).toBe(
      "President, Chair, term ended May 31, 2026"
    )
    expect(seatTermLabel({ ...president, termEndsOn: null }, "2026-10-14")).toBe("President, Chair")
  })
})

describe("nextTermStart", () => {
  it("starts the next term the day after this one ends, or today when it has no end", () => {
    expect(nextTermStart({ termEndsOn: "2026-12-31" }, "2026-10-14")).toBe("2027-01-01")
    expect(nextTermStart({ termEndsOn: null }, "2026-10-14")).toBe("2026-10-14")
  })
})
