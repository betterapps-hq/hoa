import { describe, expect, it } from "vitest"
import { nextTermStart, resignedText, seatInputSchema, seatTermLabel, servedText } from "./people"

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
  const president = { role: "chair" as const, office: "President", startedOn: "2025-01-01", endedOn: null }

  it("says when the term ends, or that it ended while they hold the seat", () => {
    expect(seatTermLabel({ ...president, termEndsOn: "2027-05-31" }, "2026-10-14")).toBe(
      "President, Chair, term ends May 31, 2027"
    )
    expect(seatTermLabel({ ...president, termEndsOn: "2026-05-31" }, "2026-10-14")).toBe(
      "President, Chair, term ended May 31, 2026"
    )
    expect(seatTermLabel({ ...president, termEndsOn: null }, "2026-10-14")).toBe("President, Chair")
  })

  it("says the day they leave once it's set, over when the term ends", () => {
    expect(seatTermLabel({ ...president, termEndsOn: "2027-05-31", endedOn: "2026-11-01" }, "2026-10-14")).toBe(
      "President, Chair, leaves Nov 1, 2026"
    )
  })
})

describe("seatTermLabel for a term to come", () => {
  const member = { role: "member" as const, office: null, termEndsOn: null, endedOn: null }

  it("says the day a term starts, or that their next one is set", () => {
    expect(seatTermLabel({ ...member, startedOn: "2026-11-01" }, "2026-10-14")).toBe("Member, starts Nov 1, 2026")
    expect(
      seatTermLabel({ ...member, startedOn: "2025-01-01", endedOn: "2027-01-01" }, "2026-10-14", {
        startedOn: "2027-01-01"
      })
    ).toBe("Member, next term from Jan 1, 2027")
  })
})

describe("servedText", () => {
  it("says when a term ran", () => {
    expect(servedText({ startedOn: "2023-01-01", endedOn: "2025-01-01" })).toBe("Jan 1, 2023 to Jan 1, 2025")
    expect(servedText({ startedOn: null, endedOn: "2025-01-01" })).toBe("Until Jan 1, 2025")
  })
})

describe("resignedText", () => {
  it("says they left, or the day they will", () => {
    expect(resignedText("the Board of Directors", "2026-10-14", "2026-10-14")).toBe("You left the Board of Directors.")
    expect(resignedText("the Board of Directors", "2026-11-01", "2026-10-14")).toBe(
      "You'll leave the Board of Directors on Nov 1, 2026."
    )
  })
})

describe("nextTermStart", () => {
  it("starts the next term the day after this one ends, or today when it has no end", () => {
    expect(nextTermStart({ termEndsOn: "2026-12-31" }, "2026-10-14")).toBe("2027-01-01")
    expect(nextTermStart({ termEndsOn: null }, "2026-10-14")).toBe("2026-10-14")
  })
})
