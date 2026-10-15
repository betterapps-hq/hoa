import { describe, expect, it } from "vitest"
import type { Ledger } from "./collections"
import type { LedgerEntry } from "./ledger"
import { monthlyTotals, monthsThrough, standingOf, totalAging } from "./receivables"

// A unit's August, September and October dues and a fine: August paid by a check that came back, September paid,
// October and the fine unpaid, half the fine waived.

const entry = (id: string, overrides: Partial<LedgerEntry>): LedgerEntry => ({
  id,
  organizationId: "hoa",
  unitId: "unit-31",
  kind: "charge",
  amountCents: 0,
  postedOn: "2026-08-01",
  dueOn: null,
  category: "dues",
  description: id,
  reference: null,
  ruleKey: null,
  rulebookId: null,
  sourceType: "schedule",
  sourceId: "dues",
  reversesId: null,
  postingKey: null,
  createdBy: "user-sam",
  createdAt: "2026-08-01T10:00:00.000Z",
  ...overrides
})

const ledger: Ledger = {
  entries: [
    entry("aug", { amountCents: 35_000, dueOn: "2026-08-01", postedOn: "2026-07-02" }),
    entry("sep", { amountCents: 35_000, dueOn: "2026-09-01", postedOn: "2026-08-02" }),
    entry("oct", { amountCents: 35_000, dueOn: "2026-10-01", postedOn: "2026-09-01" }),
    entry("fine", { amountCents: 10_000, dueOn: "2026-10-10", postedOn: "2026-10-10", category: "fine" }),
    entry("check", { kind: "payment", amountCents: -35_000, postedOn: "2026-08-05", category: "check" }),
    entry("returned", { kind: "reversal", amountCents: 35_000, postedOn: "2026-08-20", reversesId: "check" }),
    entry("cash", { kind: "payment", amountCents: -35_000, postedOn: "2026-09-03", category: "cash" }),
    entry("waive", { kind: "reversal", amountCents: -5000, postedOn: "2026-10-12", reversesId: "fine" })
  ],
  allocations: [
    { fromEntryId: "check", toEntryId: "aug", amountCents: 35_000 },
    { fromEntryId: "returned", toEntryId: "aug", amountCents: -35_000 },
    { fromEntryId: "cash", toEntryId: "aug", amountCents: 35_000 },
    { fromEntryId: "waive", toEntryId: "fine", amountCents: 5000 }
  ]
}

describe("standingOf", () => {
  it("sorts what's unpaid by how late it is, and finds the oldest charge past due", () => {
    expect(standingOf(ledger, "2026-10-14")).toEqual({
      balanceCents: 75_000,
      pastDueCents: 75_000,
      pastDueSince: "2026-09-01",
      aging: { current: 0, late30: 40_000, late60: 35_000, late90: 0, over90: 0 }
    })
  })

  it("counts a charge due today as not late yet", () => {
    expect(standingOf(ledger, "2026-09-01")).toMatchObject({ pastDueCents: 0, pastDueSince: null })
    expect(standingOf({ entries: [], allocations: [] }, "2026-10-14")).toMatchObject({
      balanceCents: 0,
      pastDueSince: null
    })
  })

  it("adds every unit's aging together", () => {
    const one = standingOf(ledger, "2026-10-14")
    expect(totalAging([one, one]).late30).toBe(80_000)
  })
})

describe("monthlyTotals", () => {
  it("bills charges by the month they're due less what's waived, and collects payments less those returned", () => {
    expect(monthlyTotals([ledger], "2026-10-14", 3)).toEqual([
      { month: "2026-08", billedCents: 35_000, collectedCents: 0 },
      { month: "2026-09", billedCents: 35_000, collectedCents: 35_000 },
      { month: "2026-10", billedCents: 40_000, collectedCents: 0 }
    ])
  })

  it("counts the months back through the turn of a year", () => {
    expect(monthsThrough("2027-02-10", 4)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"])
  })
})
